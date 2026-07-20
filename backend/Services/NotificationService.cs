using backend.Data;
using backend.Hubs;
using backend.Models.Entities;
using backend.Models.Enums;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public interface INotificationService
{
    Task NotifyCriticalVulnerabilityAsync(Guid organizationId, Guid assetId, string assetName, IReadOnlyList<string> cveIds, string? userId = null, CancellationToken ct = default);
    Task NotifyScanCompletedAsync(Guid organizationId, Guid jobId, string jobName, int processedAssets, int totalAssets, int newVulnerabilities, string? userId = null, CancellationToken ct = default);
    Task NotifyScanFailedAsync(Guid organizationId, Guid jobId, string jobName, string errorMessage, string? userId = null, CancellationToken ct = default);
    Task NotifyScheduleFailedAsync(Guid organizationId, Guid scheduleId, string scheduleName, string errorMessage, string? userId = null, CancellationToken ct = default);
}

public class NotificationService : INotificationService
{
    private readonly AppDbContext _db;
    private readonly IHubContext<NotificationHub> _hub;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(AppDbContext db, IHubContext<NotificationHub> hub, ILogger<NotificationService> logger)
    {
        _db = db;
        _hub = hub;
        _logger = logger;
    }

    public async Task NotifyCriticalVulnerabilityAsync(Guid organizationId, Guid assetId, string assetName, IReadOnlyList<string> cveIds, string? userId = null, CancellationToken ct = default)
    {
        var title = cveIds.Count == 1
            ? $"Critical CVE detected on {assetName}"
            : $"{cveIds.Count} critical CVEs detected on {assetName}";

        var message = cveIds.Count == 1
            ? $"{cveIds[0]} was found on {assetName}."
            : $"{string.Join(", ", cveIds.Take(3))}{(cveIds.Count > 3 ? " ..." : "")} were found on {assetName}.";

        var notification = new Notification
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationId,
            UserId = userId,
            Type = NotificationType.CriticalVulnerabilityFound,
            Title = title,
            Message = message,
            Link = $"/assets/{assetId}",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        _db.Notifications.Add(notification);
        await _db.SaveChangesAsync(ct);
        await BroadcastAsync(notification);

        _logger.LogInformation("Notification: {Count} critical CVE(s) on asset {AssetName}", cveIds.Count, assetName);
    }

    public async Task NotifyScanCompletedAsync(Guid organizationId, Guid jobId, string jobName, int processedAssets, int totalAssets, int newVulnerabilities, string? userId = null, CancellationToken ct = default)
    {
        var notification = new Notification
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationId,
            UserId = userId,
            Type = NotificationType.ScanCompleted,
            Title = $"Scan completed: {jobName}",
            Message = $"Processed {processedAssets}/{totalAssets} assets. {newVulnerabilities} new CVE(s) found.",
            Link = "/cve-mapping",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        _db.Notifications.Add(notification);
        await _db.SaveChangesAsync(ct);
        await BroadcastAsync(notification);

        _logger.LogInformation("Notification: scan completed for org {OrgId}", organizationId);
    }

    public async Task NotifyScanFailedAsync(Guid organizationId, Guid jobId, string jobName, string errorMessage, string? userId = null, CancellationToken ct = default)
    {
        var notification = new Notification
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationId,
            UserId = userId,
            Type = NotificationType.ScanFailed,
            Title = $"Scan failed: {jobName}",
            Message = errorMessage,
            Link = "/cve-mapping",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        _db.Notifications.Add(notification);
        await _db.SaveChangesAsync(ct);
        await BroadcastAsync(notification);

        _logger.LogWarning("Notification: scan failed for org {OrgId}", organizationId);
    }

    public async Task NotifyScheduleFailedAsync(Guid organizationId, Guid scheduleId, string scheduleName, string errorMessage, string? userId = null, CancellationToken ct = default)
    {
        var notification = new Notification
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationId,
            UserId = userId,
            Type = NotificationType.ScheduleFailed,
            Title = $"Schedule failed: {scheduleName}",
            Message = errorMessage,
            Link = "/settings/scan-schedules",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        _db.Notifications.Add(notification);
        await _db.SaveChangesAsync(ct);
        await BroadcastAsync(notification);

        _logger.LogWarning("Notification: schedule failed for org {OrgId}", organizationId);
    }

    private async Task BroadcastAsync(Notification notification)
    {
        var message = new NotificationMessage
        {
            Id = notification.Id,
            Type = notification.Type,
            Title = notification.Title,
            Message = notification.Message,
            Link = notification.Link,
            IsRead = notification.IsRead,
            CreatedAt = notification.CreatedAt
        };

        var orgGroup = notification.OrganizationId.ToString();

        if (string.IsNullOrEmpty(notification.UserId))
        {
            await _hub.Clients.Group(orgGroup).SendAsync("NewNotification", message);
        }
        else
        {
            await _hub.Clients.User(notification.UserId).SendAsync("NewNotification", message);
        }
    }
}
