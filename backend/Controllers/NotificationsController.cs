using backend.Data;
using backend.Hubs;
using backend.Models.Entities;
using backend.Models.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

public class NotificationResponse
{
    public Guid Id { get; set; }
    public NotificationType Type { get; set; }
    public string Title { get; set; } = "";
    public string Message { get; set; } = "";
    public string? Link { get; set; }
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; }
}

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController : TenantControllerBase
{
    private readonly IHubContext<NotificationHub> _hub;

    public NotificationsController(AppDbContext db, UserManager<AppUser> userManager, IHubContext<NotificationHub> hub)
        : base(db, userManager)
    {
        _hub = hub;
    }

    private string CurrentUserId => _userManager.GetUserId(User) ?? "";

    private IQueryable<Notification> VisibleNotifications()
    {
        return _db.Notifications
            .Where(n => n.UserId == null || n.UserId == CurrentUserId);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        var query = VisibleNotifications()
            .OrderBy(n => n.IsRead)
            .ThenByDescending(n => n.CreatedAt);

        var total = await query.CountAsync();
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new { items = items.Select(ToResponse).ToList(), total, page, pageSize });
    }

    [HttpGet("unread-count")]
    public async Task<IActionResult> GetUnreadCount()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var count = await VisibleNotifications()
            .CountAsync(n => !n.IsRead);

        return Ok(new { count });
    }

    [HttpPatch("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var notification = await VisibleNotifications().FirstOrDefaultAsync(n => n.Id == id);
        if (notification == null) return NotFound();

        notification.IsRead = true;
        notification.ReadAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [HttpPost("mark-all-read")]
    public async Task<IActionResult> MarkAllRead()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        await VisibleNotifications()
            .Where(n => !n.IsRead)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(n => n.IsRead, true)
                .SetProperty(n => n.ReadAt, DateTime.UtcNow));

        return NoContent();
    }

    [HttpPost("test")]
    public async Task<IActionResult> CreateTestNotification()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var notification = new Notification
        {
            Id = Guid.NewGuid(),
            OrganizationId = orgId.Value,
            Type = NotificationType.ScanCompleted,
            Title = "Test notification",
            Message = "This is a test notification from the dev tools.",
            Link = "/notifications",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        _db.Notifications.Add(notification);
        await _db.SaveChangesAsync();

        await _hub.Clients.Group(orgId.Value.ToString()).SendAsync("NewNotification", new NotificationMessage
        {
            Id = notification.Id,
            Type = notification.Type,
            Title = notification.Title,
            Message = notification.Message,
            Link = notification.Link,
            IsRead = notification.IsRead,
            CreatedAt = notification.CreatedAt
        });

        return Ok(ToResponse(notification));
    }

    private static NotificationResponse ToResponse(Notification n)
    {
        return new NotificationResponse
        {
            Id = n.Id,
            Type = n.Type,
            Title = n.Title,
            Message = n.Message,
            Link = n.Link,
            IsRead = n.IsRead,
            CreatedAt = n.CreatedAt
        };
    }
}
