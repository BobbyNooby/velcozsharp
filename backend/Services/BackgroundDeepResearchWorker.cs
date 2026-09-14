using backend.Data;
using backend.Services;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

/// <summary>
/// Polls Valyu for DeepResearch audit tasks we have queued/running and hydrates
/// IntelReport rows with progress, then the finished report. Mirrors BackgroundScanWorker.
/// </summary>
public class BackgroundDeepResearchWorker : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan TaskTimeout = TimeSpan.FromHours(3);

    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<BackgroundDeepResearchWorker> _logger;

    public BackgroundDeepResearchWorker(IServiceProvider serviceProvider, ILogger<BackgroundDeepResearchWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("BackgroundDeepResearchWorker started");

        using var timer = new PeriodicTimer(PollInterval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await PollActiveReportsAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Error polling DeepResearch reports");
            }
        }
    }

    private async Task PollActiveReportsAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var valyu = scope.ServiceProvider.GetRequiredService<IValyuService>();
        var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();

        // Global tenant filter is off here — the worker crosses org boundaries by design.
        var active = await db.IntelReports
            .IgnoreQueryFilters()
            .Where(r => r.Status == "Queued" || r.Status == "Running")
            .ToListAsync(ct);

        foreach (var report in active)
        {
            if (ct.IsCancellationRequested) break;

            if (DateTime.UtcNow - report.StartedAt > TaskTimeout)
            {
                report.Status = "Failed";
                report.CompletedAt = DateTime.UtcNow;
                report.ErrorMessage = "Timed out after 3 hours.";
                await notifications.NotifyReportCompletedAsync(report.OrganizationId, report.Id, report.Title, false, report.ErrorMessage, ct);
                await db.SaveChangesAsync(ct);
                continue;
            }

            try
            {
                var status = await valyu.GetDeepResearchStatusAsync(report.TaskId, ct);

                switch (status.Status)
                {
                    case "queued":
                        report.Status = "Queued";
                        break;

                    case "running":
                        report.Status = "Running";
                        if (status.Progress != null)
                        {
                            report.CurrentStep = status.Progress.CurrentStep;
                            report.TotalSteps = status.Progress.TotalSteps;
                        }
                        break;

                    case "completed":
                        report.Status = "Completed";
                        report.CompletedAt = status.CompletedAt ?? DateTime.UtcNow;
                        report.CostUsd = status.Cost;
                        report.SourceCount = status.Sources?.Count;
                        report.ReportMarkdown = status.OutputText;
                        report.PdfUrl = status.PdfUrl;
                        await notifications.NotifyReportCompletedAsync(report.OrganizationId, report.Id, report.Title, true, ct: ct);
                        _logger.LogInformation("DeepResearch report {ReportId} completed ({CostUsd}$, {Sources} sources)",
                            report.Id, status.Cost, status.Sources?.Count ?? 0);
                        break;

                    case "failed":
                    case "cancelled":
                        report.Status = "Failed";
                        report.CompletedAt = status.CompletedAt ?? DateTime.UtcNow;
                        report.CostUsd = status.Cost;
                        report.ErrorMessage = status.Error ?? status.Message ?? $"Task {status.Status}.";
                        await notifications.NotifyReportCompletedAsync(report.OrganizationId, report.Id, report.Title, false, report.ErrorMessage, ct);
                        break;

                    default:
                        _logger.LogWarning("Unknown DeepResearch status '{Status}' for report {ReportId}", status.Status, report.Id);
                        break;
                }

                await db.SaveChangesAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Transient network/API failure — leave the row and retry next tick.
                _logger.LogWarning(ex, "Status poll failed for report {ReportId} (task {TaskId})", report.Id, report.TaskId);
            }
        }
    }
}
