namespace backend.Models.Dtos;

public class BulkScanRequest
{
    public List<Guid> AssetIds { get; set; } = [];
}

public class ScanJobResponse
{
    public Guid Id { get; set; }
    public string Type { get; set; } = "";
    public string Status { get; set; } = "";
    public int TotalAssets { get; set; }
    public int ProcessedAssets { get; set; }
    public int NewVulnerabilitiesFound { get; set; }
    public string? CurrentAssetName { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public TimeSpan? Duration => CompletedAt.HasValue && StartedAt.HasValue
        ? CompletedAt.Value - StartedAt.Value
        : StartedAt.HasValue
            ? DateTime.UtcNow - StartedAt.Value
            : null;
}
