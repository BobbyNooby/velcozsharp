using backend.Data;
using backend.Models.Entities;
using backend.Models.Enums;
using backend.Services;
using Cronos;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public class BackgroundScanWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<BackgroundScanWorker> _logger;

    public BackgroundScanWorker(IServiceProvider serviceProvider, ILogger<BackgroundScanWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
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

        _logger.LogInformation("Processing scan job {JobId} (Type: {Type}, Org: {OrgId})",
            job.Id, job.Type, job.OrganizationId);

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
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Scan failed for asset {AssetId} in job {JobId}", assetId, job.Id);
                    processed++;
                }
            }

            job.ProcessedAssets = processed;
            job.NewVulnerabilitiesFound = totalFound;
            job.Status = processed > 0 ? ScanJobStatus.Completed : ScanJobStatus.Failed;
            job.CompletedAt = DateTime.UtcNow;

            _logger.LogInformation("Scan job {JobId} completed: {Processed}/{Total} assets, {Found} CVEs",
                job.Id, processed, assetIds.Count, totalFound);
        }
        catch (Exception ex)
        {
            job.Status = ScanJobStatus.Failed;
            job.ErrorMessage = ex.Message;
            job.CompletedAt = DateTime.UtcNow;
            _logger.LogError(ex, "Scan job {JobId} failed", job.Id);
        }

        await db.SaveChangesAsync(ct);
    }
}
