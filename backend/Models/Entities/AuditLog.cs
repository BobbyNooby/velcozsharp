namespace backend.Models.Entities;

public class AuditLog
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    public string EntityType { get; set; } = "";
    public string EntityId { get; set; } = "";
    public string Action { get; set; } = "";
    public string? BeforeJson { get; set; }
    public string? AfterJson { get; set; }
    public string? ChangedByUserId { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
