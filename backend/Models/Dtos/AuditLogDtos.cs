namespace backend.Models.Dtos;

public class AuditLogResponse
{
    public Guid Id { get; set; }
    public string Action { get; set; } = "";
    public string EntityType { get; set; } = "";
    public string EntityId { get; set; } = "";
    public string? BeforeJson { get; set; }
    public string? AfterJson { get; set; }
    public string? ChangedByUserId { get; set; }
    public DateTime Timestamp { get; set; }
}
