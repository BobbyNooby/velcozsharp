using backend.Models.Enums;

namespace backend.Models.Entities;

public class Notification
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    // Null UserId = broadcast to all org members
    public string? UserId { get; set; }

    public NotificationType Type { get; set; }
    public string Title { get; set; } = "";
    public string Message { get; set; } = "";

    // Optional relative link, e.g. /assets/{assetId}
    public string? Link { get; set; }

    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
