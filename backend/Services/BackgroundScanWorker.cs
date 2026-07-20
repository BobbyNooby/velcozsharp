using backend.Data;
using backend.Hubs;
using backend.Models.Dtos;
using backend.Models.Entities;
using backend.Models.Enums;
using backend.Services;
using Cronos;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public class BackgroundScanWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<BackgroundScanWorker> _logger;
    private readonly IHubContext<NotificationHub> _hub;

    public BackgroundScanWorker(IServiceProvider serviceProvider, ILogger<BackgroundScanWorker> logger, IHubContext<NotificationHub> hub)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _hub = hub;
    }

    private DateTime _lastScheduleCheck = DateTime.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("BackgroundScanWorker started");

        // Reset any jobs that were left Running from a previous crash/restart
        await ResetStuckJobsAsync(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Process queued scan jobs
                await ProcessNextJobAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing scan job");
            }

            // Check for due schedules every 60 seconds
            if (DateTime.UtcNow - _lastScheduleCheck > TimeSpan.FromMinutes(1))
            {
                try
                {
                    await EnqueueDueSchedulesAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error checking due schedules");
                }
            }

            // Poll every 3 seconds for new jobs
            await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
        }
    }

    private async Task EnqueueDueSchedulesAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();

        // Get all enabled schedules across all orgs
        var schedules = await db.RecurringScanConfigs
            .IgnoreQueryFilters()
            .Where(s => s.Enabled)
            .ToListAsync(ct);

        var now = DateTime.UtcNow;

        foreach (var schedule in schedules)
        {
            try
            {
                var cron = Cronos.CronExpression.Parse(schedule.CronExpression);
                var sinceTime = schedule.LastRunAt ?? schedule.CreatedAt;
                var nextUtc = cron.GetNextOccurrence(sinceTime, TimeZoneInfo.Utc);

                // Fire if:
                // 1. Schedule was never run and first occurrence is in the past (catch up)
                // 2. OR the next occurrence is due now or within the last 2 minutes
                var isFirstRun = schedule.LastRunAt == null;
                var isDue = nextUtc.HasValue && nextUtc.Value <= now;

                if (!isDue)
                    continue;

                if (!isFirstRun && (now - nextUtc.Value).TotalMinutes > 2)
                    continue; // Missed the window, wait for next cycle
                {
                    // Determine target assets
                    List<Guid>? targetIds = null;
                    if (schedule.Scope == ScanJobType.Bulk && schedule.TargetAssetIds?.Count > 0)
                    {
                        targetIds = schedule.TargetAssetIds;
                    }
                    else if (schedule.Scope == ScanJobType.Single && schedule.TargetAssetIds?.Count == 1)
                    {
                        targetIds = schedule.TargetAssetIds;
                    }

                    var job = new ScanJob
                    {
                        Id = Guid.NewGuid(),
                        OrganizationId = schedule.OrganizationId,
                        Type = schedule.Scope,
                        Status = ScanJobStatus.Queued,
                        TargetAssetIds = targetIds,
                        TotalAssets = 0, // Will be filled when processed
                        CreatedAt = now
                    };

                    db.ScanJobs.Add(job);
                    schedule.LastRunAt = nextUtc.Value;
                    schedule.UpdatedAt = now;

                    _logger.LogInformation(
                        "Scheduled scan job {JobId} from schedule {ScheduleId} ({ScheduleName}) for org {OrgId}",
                        job.Id, schedule.Id, schedule.Name, schedule.OrganizationId);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to process schedule {ScheduleId}", schedule.Id);
                await notifications.NotifyScheduleFailedAsync(schedule.OrganizationId, schedule.Id, schedule.Name, ex.Message);
            }
        }

        await db.SaveChangesAsync(ct);
        _lastScheduleCheck = now;
    }

    private async Task ResetStuckJobsAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var stuckJobs = await db.ScanJobs
                .IgnoreQueryFilters()
                .Where(j => j.Status == ScanJobStatus.Running)
                .ToListAsync(ct);

            foreach (var job in stuckJobs)
            {
                job.Status = ScanJobStatus.Queued;
                job.ErrorMessage = "Restarted after worker restart";
                _logger.LogWarning("Reset stuck scan job {JobId} to Queued", job.Id);
            }

            if (stuckJobs.Count > 0)
                await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to reset stuck scan jobs");
        }
    }

    private async Task ProcessNextJobAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cveMapping = scope.ServiceProvider.GetRequiredService<ICveMappingService>();
        var aiCveMapping = scope.ServiceProvider.GetRequiredService<IAiCveMappingService>();
        var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();

        // Find next queued job (FIFO) - ignore tenant filter because background worker has no HTTP context
        var job = await db.ScanJobs
            .IgnoreQueryFilters()
            .Where(j => j.Status == ScanJobStatus.Queued)
            .OrderBy(j => j.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (job == null) return;

        // Set tenant context from the job itself so subsequent queries respect org isolation
        db.CurrentOrganizationId = job.OrganizationId;

        // Mark as running
        job.Status = ScanJobStatus.Running;
        job.StartedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

            _logger.LogInformation("Processing scan job {JobId} (Type: {Type}, Org: {OrgId}, AI: {UseAi})",
                job.Id, job.Type, job.OrganizationId, job.UseAi);

        try
        {
            var processed = 0;
            var totalFound = 0;

            // Determine target assets
            List<Guid> assetIds;
            if (job.Type == ScanJobType.Single && job.TargetAssetIds?.Count == 1)
            {
                assetIds = job.TargetAssetIds;
            }
            else if (job.Type == ScanJobType.Bulk && job.TargetAssetIds?.Count > 0)
            {
                assetIds = job.TargetAssetIds;
            }
            else
            {
                // All assets in org
                assetIds = await db.Assets
                    .Where(a => a.OrganizationId == job.OrganizationId && a.Status != AssetStatus.Decommissioned)
                    .Select(a => a.Id)
                    .ToListAsync(ct);
            }

            job.TotalAssets = assetIds.Count;

            if (job.UseAi)
            {
                // AI deep scan path: 2 AI calls per chunk of 50 assets
                var progress = new Progress<AiBulkScanProgress>(async p =>
                {
                    job.CurrentAssetName = p.CurrentAssetName;
                    job.ProcessedAssets = p.ProcessedAssets;
                    try
                    {
                        await _hub.Clients.Group(job.OrganizationId.ToString()).SendAsync("ScanProgress", new
                        {
                            jobId = job.Id,
                            processedAssets = p.ProcessedAssets,
                            totalAssets = p.TotalAssets,
                            currentAssetName = p.CurrentAssetName,
                            currentChunk = p.CurrentChunk,
                            totalChunks = p.TotalChunks,
                            newVulnerabilitiesFound = p.TotalCvesFound,
                            stage = p.Stage,
                            status = "Running"
                        }, ct);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to send AI scan progress");
                    }
                });

                var aiResults = await aiCveMapping.ScanBulkAsync(assetIds, job.OrganizationId, progress, ct);
                processed = aiResults.Count;
                totalFound = aiResults.Sum(r => r.CvesNewlyAssigned);

                await _hub.Clients.Group(job.OrganizationId.ToString()).SendAsync("ScanProgress", new
                {
                    jobId = job.Id,
                    processedAssets = processed,
                    totalAssets = assetIds.Count,
                    currentAssetName = aiResults.LastOrDefault()?.AssetName,
                    currentChunk = aiResults.Count > 0 ? 1 : 0,
                    totalChunks = 1,
                    newVulnerabilitiesFound = totalFound,
                    stage = "Completed",
                    status = "Running"
                }, ct);
            }
            else
            {
                // Regex fast scan path: one asset at a time
                foreach (var assetId in assetIds)
                {
                    if (ct.IsCancellationRequested) break;

                    try
                    {
                        // Update current asset name for progress visibility
                        var assetName = await db.Assets
                            .Where(a => a.Id == assetId)
                            .Select(a => a.Name)
                            .FirstOrDefaultAsync(ct);
                        job.CurrentAssetName = assetName ?? assetId.ToString();
                        await db.SaveChangesAsync(ct);

                        // Small delay to respect NVD rate limits
                        await Task.Delay(600, ct);
                        var matches = await cveMapping.ScanAssetAsync(assetId, job.OrganizationId);
                        totalFound += matches.Count;
                        processed++;

                        await _hub.Clients.Group(job.OrganizationId.ToString()).SendAsync("ScanProgress", new
                        {
                            jobId = job.Id,
                            processedAssets = processed,
                            totalAssets = assetIds.Count,
                            currentAssetName = job.CurrentAssetName,
                            newVulnerabilitiesFound = totalFound,
                            status = "Running"
                        }, ct);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Scan failed for asset {AssetId} in job {JobId}", assetId, job.Id);
                        processed++;
                    }
                }
            }

            job.ProcessedAssets = processed;
            job.NewVulnerabilitiesFound = totalFound;
            job.Status = processed > 0 ? ScanJobStatus.Completed : ScanJobStatus.Failed;
            job.CompletedAt = DateTime.UtcNow;

            await _hub.Clients.Group(job.OrganizationId.ToString()).SendAsync("ScanProgress", new
            {
                jobId = job.Id,
                processedAssets = processed,
                totalAssets = assetIds.Count,
                currentAssetName = job.CurrentAssetName,
                newVulnerabilitiesFound = totalFound,
                status = job.Status.ToString()
            }, ct);

            if (job.Status == ScanJobStatus.Completed)
            {
                await notifications.NotifyScanCompletedAsync(
                    job.OrganizationId,
                    job.Id,
                    $"{job.Type} scan",
                    processed,
                    assetIds.Count,
                    totalFound);
            }
            else
            {
                await notifications.NotifyScanFailedAsync(
                    job.OrganizationId,
                    job.Id,
                    $"{job.Type} scan",
                    "No assets were successfully processed");
            }

            _logger.LogInformation("Scan job {JobId} completed: {Processed}/{Total} assets, {Found} CVEs",
                job.Id, processed, assetIds.Count, totalFound);
        }
        catch (Exception ex)
        {
            job.Status = ScanJobStatus.Failed;
            job.ErrorMessage = ex.Message;
            job.CompletedAt = DateTime.UtcNow;

            await notifications.NotifyScanFailedAsync(
                job.OrganizationId,
                job.Id,
                $"{job.Type} scan",
                ex.Message);

            _logger.LogError(ex, "Scan job {JobId} failed", job.Id);
        }

        await db.SaveChangesAsync(ct);
    }
}
