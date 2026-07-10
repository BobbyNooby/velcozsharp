using backend.Models.Enums;

namespace backend.Models.Entities;

public class RecurringScanConfig
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    public string Name { get; set; } = "";
    public string CronExpression { get; set; } = "0 2 * * *";
    public ScanJobType Scope { get; set; } = ScanJobType.All;
    public List<Guid>? TargetAssetIds { get; set; }

    public bool Enabled { get; set; } = true;
    public DateTime? LastRunAt { get; set; }

    public string? CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
