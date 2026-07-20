namespace backend.Models.Dtos;

public record AiAssetSummary(
    Guid Id,
    string Name,
    string? AssetTypeName,
    string? Criticality,
    string? Exposure,
    Dictionary<string, object> Properties);

public record AiCveSummary(
    string CveId,
    string? Severity,
    double? CvssScore,
    string Description,
    string AffectedInfo);

public record AiAssetWithCves(
    AiAssetSummary Asset,
    List<AiCveSummary> Cves);

public record AiKeywordSuggestion(
    Guid AssetId,
    List<string> Keywords);

public record AiScoredResult(
    Guid AssetId,
    string CveId,
    int RelevanceScore,
    string Reasoning,
    string? Mitigation);

public record AiBulkKeywordResponse(
    List<AiKeywordSuggestion> Suggestions,
    string RawResponse);

public record AiBulkScoreResponse(
    List<AiScoredResult> Results,
    string RawResponse);

public record AiDeepScanResult(
    Guid AssetId,
    string AssetName,
    int CvesFound,
    int CvesNewlyAssigned,
    double? HighestAiScore,
    string? HighestSeverity);

public class AiBulkScanRequest
{
    public List<Guid> AssetIds { get; set; } = [];
    public Guid OrganizationId { get; set; }
}

public class AiBulkScanProgress
{
    public int TotalAssets { get; set; }
    public int ProcessedAssets { get; set; }
    public int CurrentChunk { get; set; }
    public int TotalChunks { get; set; }
    public string? CurrentAssetName { get; set; }
    public int TotalCvesFound { get; set; }
    public string? Stage { get; set; }
}
