using backend.Models.Enums;

namespace backend.Models.Entities;

public class ScanJob
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    public ScanJobType Type { get; set; }
    public ScanJobStatus Status { get; set; } = ScanJobStatus.Queued;

    public List<Guid>? TargetAssetIds { get; set; }

    public int TotalAssets { get; set; }
    public int ProcessedAssets { get; set; }
    public int NewVulnerabilitiesFound { get; set; }
    public string? CurrentAssetName { get; set; }
    public string? ErrorMessage { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}
