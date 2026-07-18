namespace backend.Models.Dtos;

public class DashboardStatsResponse
{
    public int TotalAssets { get; set; }
    public int TotalVulnerabilities { get; set; }
    public int ActiveVulnerabilities { get; set; }
    public Dictionary<string, int> SeverityBreakdown { get; set; } = new();
    public List<HighestRiskAssetResponse> HighestRiskAssets { get; set; } = [];
    public List<RecentScanActivityResponse> RecentScanActivity { get; set; } = [];
}

public class HighestRiskAssetResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string AssetTypeName { get; set; } = "";
    public double? HighestCvssScore { get; set; }
    public string? HighestSeverity { get; set; }
    public int VulnerabilityCount { get; set; }
}

public class RecentScanActivityResponse
{
    public Guid AssetId { get; set; }
    public string AssetName { get; set; } = "";
    public DateTime? LastScannedAt { get; set; }
    public int VulnerabilitiesFound { get; set; }
}
