using backend.Data;
using backend.Models.Dtos;
using backend.Models.Entities;
using backend.Models.Enums;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace backend.Services;

public interface IAiCveMappingService
{
    Task<List<AiDeepScanResult>> ScanBulkAsync(
        List<Guid> assetIds,
        Guid organizationId,
        IProgress<AiBulkScanProgress>? progress = null,
        CancellationToken ct = default);
}

public class AiCveMappingService : IAiCveMappingService
{
    private const int AssetChunkSize = 50;

    private readonly AppDbContext _db;
    private readonly IOpenRouterService _openRouter;
    private readonly INvdApiService _nvdApi;
    private readonly INotificationService _notifications;
    private readonly ILogger<AiCveMappingService> _logger;

    public AiCveMappingService(
        AppDbContext db,
        IOpenRouterService openRouter,
        INvdApiService nvdApi,
        INotificationService notifications,
        ILogger<AiCveMappingService> logger)
    {
        _db = db;
        _openRouter = openRouter;
        _nvdApi = nvdApi;
        _notifications = notifications;
        _logger = logger;
    }

    public async Task<List<AiDeepScanResult>> ScanBulkAsync(
        List<Guid> assetIds,
        Guid organizationId,
        IProgress<AiBulkScanProgress>? progress = null,
        CancellationToken ct = default)
    {
        _db.CurrentOrganizationId = organizationId;

        var org = await _db.Organizations.FindAsync([organizationId], ct);
        var nvdApiKey = org?.NvdApiKey;

        // Load all assets with their asset type fields
        var assets = await _db.Assets
            .Include(a => a.AssetType)
                .ThenInclude(at => at!.Fields)
            .Where(a => assetIds.Contains(a.Id) && a.OrganizationId == organizationId)
            .OrderBy(a => a.Name)
            .ToListAsync(ct);

        if (assets.Count == 0)
        {
            _logger.LogWarning("No assets found for AI scan in org {OrgId}", organizationId);
            return [];
        }

        var results = new List<AiDeepScanResult>();
        var totalAssets = assets.Count;
        var processedAssets = 0;
        var totalChunks = (int)Math.Ceiling((double)totalAssets / AssetChunkSize);

        for (var chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++)
        {
            var chunkAssets = assets
                .Skip(chunkIndex * AssetChunkSize)
                .Take(AssetChunkSize)
                .ToList();

            progress?.Report(new AiBulkScanProgress
            {
                TotalAssets = totalAssets,
                ProcessedAssets = processedAssets,
                CurrentChunk = chunkIndex + 1,
                TotalChunks = totalChunks,
                CurrentAssetName = chunkAssets.FirstOrDefault()?.Name,
                Stage = "Generating NVD keywords with AI..."
            });

            var assetSummaries = chunkAssets.Select(ToAssetSummary).ToList();

            List<AiKeywordSuggestion> keywordSuggestions;
            try
            {
                var keywordResponse = await _openRouter.BulkSuggestKeywordsAsync(assetSummaries, ct);
                keywordSuggestions = ParseKeywordSuggestions(keywordResponse, assetSummaries);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "AI keyword suggestion failed for chunk {Chunk}. Falling back to property extraction.", chunkIndex + 1);
                keywordSuggestions = FallbackKeywordSuggestions(assetSummaries);
            }

            progress?.Report(new AiBulkScanProgress
            {
                TotalAssets = totalAssets,
                ProcessedAssets = processedAssets,
                CurrentChunk = chunkIndex + 1,
                TotalChunks = totalChunks,
                CurrentAssetName = chunkAssets.FirstOrDefault()?.Name,
                Stage = $"Querying NVD for {chunkAssets.Count} assets..."
            });

            // Query NVD for each asset in parallel, with fallback to broader keywords
            var nvdTasks = keywordSuggestions.Select(async suggestion =>
            {
                if (suggestion.Keywords.Count == 0)
                {
                    return new { suggestion.AssetId, Result = new NvdSearchResult() };
                }

                try
                {
                    var result = await SearchNvdWithFallbackAsync(suggestion.Keywords, nvdApiKey);
                    return new { suggestion.AssetId, Result = result };
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "NVD query failed for asset {AssetId} with keywords {Keywords}", suggestion.AssetId, suggestion.Keywords);
                    return new { suggestion.AssetId, Result = new NvdSearchResult() };
                }
            }).ToList();

            var nvdResults = await Task.WhenAll(nvdTasks);

            // Flatten and deduplicate CVEs across the chunk
            var cveById = new Dictionary<string, NvdCve>();
            var cvesPerAsset = new Dictionary<Guid, List<NvdCve>>();

            foreach (var item in nvdResults)
            {
                var assetCves = item.Result.Vulnerabilities?.Select(v => v.Cve).Where(c => c != null).ToList() ?? [];
                cvesPerAsset[item.AssetId] = assetCves;

                foreach (var cve in assetCves)
                {
                    cveById[cve.Id] = cve;
                }
            }

            if (cveById.Count == 0)
            {
                _logger.LogInformation("No CVEs found for AI scan chunk {Chunk}", chunkIndex + 1);

                foreach (var asset in chunkAssets)
                {
                    asset.LastScannedAt = DateTime.UtcNow;
                    results.Add(new AiDeepScanResult(asset.Id, asset.Name, 0, 0, null, null));
                }

                await _db.SaveChangesAsync(ct);
                processedAssets += chunkAssets.Count;
                continue;
            }

            // Build per-asset CVE summaries for scoring (scoped to CVEs each asset's keywords returned)
            var assetsWithCves = new List<AiAssetWithCves>();
            foreach (var assetSummary in assetSummaries)
            {
                if (cvesPerAsset.TryGetValue(assetSummary.Id, out var assetCveList))
                {
                    var summaries = assetCveList.Select(ToCveSummary).Distinct().ToList();
                    assetsWithCves.Add(new AiAssetWithCves(assetSummary, summaries));
                }
                else
                {
                    assetsWithCves.Add(new AiAssetWithCves(assetSummary, []));
                }
            }

            var totalCvesToScore = assetsWithCves.Sum(a => a.Cves.Count);

            progress?.Report(new AiBulkScanProgress
            {
                TotalAssets = totalAssets,
                ProcessedAssets = processedAssets,
                CurrentChunk = chunkIndex + 1,
                TotalChunks = totalChunks,
                CurrentAssetName = chunkAssets.FirstOrDefault()?.Name,
                TotalCvesFound = cveById.Count,
                Stage = $"AI scoring {totalCvesToScore} CVEs against {chunkAssets.Count} assets..."
            });

            List<AiScoredResult> scoredResults;

            try
            {
                var scoreResponse = await _openRouter.BulkScoreCvesAsync(assetsWithCves, ct);
                scoredResults = ParseScoredResults(scoreResponse, assetSummaries);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "AI bulk scoring failed for chunk {Chunk}. Skipping CVE assignments.", chunkIndex + 1);
                scoredResults = [];
            }

            // Persist results
            var chunkResults = await PersistResultsAsync(
                chunkAssets,
                cvesPerAsset,
                cveById,
                scoredResults,
                organizationId,
                ct);

            results.AddRange(chunkResults);
            processedAssets += chunkAssets.Count;

            progress?.Report(new AiBulkScanProgress
            {
                TotalAssets = totalAssets,
                ProcessedAssets = processedAssets,
                CurrentChunk = chunkIndex + 1,
                TotalChunks = totalChunks,
                CurrentAssetName = chunkAssets.LastOrDefault()?.Name,
                TotalCvesFound = cveById.Count,
                Stage = $"Saved {chunkResults.Sum(r => r.CvesNewlyAssigned)} CVE assignments"
            });
        }

        _logger.LogInformation("AI deep scan complete for org {OrgId}: {Processed} assets processed", organizationId, processedAssets);
        return results;
    }

    private async Task<List<AiDeepScanResult>> PersistResultsAsync(
        List<Asset> chunkAssets,
        Dictionary<Guid, List<NvdCve>> cvesPerAsset,
        Dictionary<string, NvdCve> cveById,
        List<AiScoredResult> scoredResults,
        Guid organizationId,
        CancellationToken ct)
    {
        var results = new List<AiDeepScanResult>();
        var scoreByAssetCve = scoredResults
            .GroupBy(r => (r.AssetId, r.CveId))
            .ToDictionary(g => g.Key, g => g.First());

        var newCriticalOrHighCveIds = new List<string>();
        var notificationsByAsset = new Dictionary<Guid, (string AssetName, List<string> CveIds)>();

        foreach (var asset in chunkAssets)
        {
            double? highestCvss = null;
            string? highestSeverity = null;
            double? highestAiScore = null;
            var cvesFound = 0;
            var newlyAssigned = 0;

            if (cvesPerAsset.TryGetValue(asset.Id, out var assetCves))
            {
                foreach (var cve in assetCves)
                {
                    cvesFound++;

                    if (!scoreByAssetCve.TryGetValue((asset.Id, cve.Id), out var scoreResult))
                    {
                        continue;
                    }

                    // Score threshold: > 0 means save
                    if (scoreResult.RelevanceScore <= 0)
                    {
                        continue;
                    }

                    var cvssData = cve.Metrics?.CvssMetricV31?.FirstOrDefault()?.CvssData
                                ?? cve.Metrics?.CvssMetricV30?.FirstOrDefault()?.CvssData;

                    // Upsert Vulnerability
                    var vulnerability = await _db.Vulnerabilities.FirstOrDefaultAsync(v => v.CveId == cve.Id, ct);
                    if (vulnerability == null)
                    {
                        var description = cve.Descriptions.FirstOrDefault(d => d.Lang == "en")?.Value ?? "";
                        vulnerability = new Vulnerability
                        {
                            Id = Guid.NewGuid(),
                            CveId = cve.Id,
                            Description = description.Length > 2000 ? description[..2000] : description,
                            CvssScore = cvssData?.BaseScore,
                            Severity = cvssData?.BaseSeverity,
                            PublishedDate = ParseDate(cve.Published),
                            FetchedAt = DateTime.UtcNow,
                            AiSuggestedMitigation = scoreResult.Mitigation
                        };
                        _db.Vulnerabilities.Add(vulnerability);
                    }
                    else if (!string.IsNullOrEmpty(scoreResult.Mitigation))
                    {
                        vulnerability.AiSuggestedMitigation = scoreResult.Mitigation;
                    }

                    // Upsert AssetVulnerability
                    var existingLink = await _db.AssetVulnerabilities
                        .FirstOrDefaultAsync(av => av.AssetId == asset.Id && av.VulnerabilityId == vulnerability.Id, ct);

                    if (existingLink == null)
                    {
                        _db.AssetVulnerabilities.Add(new AssetVulnerability
                        {
                            AssetId = asset.Id,
                            VulnerabilityId = vulnerability.Id,
                            OrganizationId = organizationId,
                            DetectedAt = DateTime.UtcNow,
                            Status = "Active",
                            MatchedKeyword = "AI deep scan",
                            AiRelevanceScore = scoreResult.RelevanceScore
                        });
                        newlyAssigned++;

                        if (IsCriticalOrHigh(cvssData?.BaseSeverity))
                        {
                            newCriticalOrHighCveIds.Add(cve.Id);
                            if (!notificationsByAsset.ContainsKey(asset.Id))
                            {
                                notificationsByAsset[asset.Id] = (asset.Name, []);
                            }
                            notificationsByAsset[asset.Id].CveIds.Add(cve.Id);
                        }
                    }
                    else
                    {
                        existingLink.AiRelevanceScore = scoreResult.RelevanceScore;
                    }

                    if (cvssData?.BaseScore > highestCvss)
                    {
                        highestCvss = cvssData.BaseScore;
                        highestSeverity = cvssData.BaseSeverity;
                    }

                    if (scoreResult.RelevanceScore > highestAiScore)
                    {
                        highestAiScore = scoreResult.RelevanceScore;
                    }
                }
            }

            asset.HighestCvssScore = highestCvss;
            asset.HighestSeverity = highestSeverity;
            asset.LastScannedAt = DateTime.UtcNow;

            if (asset.IsCriticalityAuto)
            {
                asset.Criticality = MapSeverityToCriticality(highestSeverity);
            }

            results.Add(new AiDeepScanResult(
                asset.Id,
                asset.Name,
                cvesFound,
                newlyAssigned,
                highestAiScore,
                highestSeverity));
        }

        await _db.SaveChangesAsync(ct);

        foreach (var (assetId, (assetName, cveIds)) in notificationsByAsset)
        {
            if (cveIds.Count > 0)
            {
                await _notifications.NotifyCriticalVulnerabilityAsync(organizationId, assetId, assetName, cveIds);
            }
        }

        return results;
    }

    private static AiAssetSummary ToAssetSummary(Asset asset)
    {
        var props = new Dictionary<string, object>(asset.Properties)
        {
            ["criticality"] = asset.Criticality.ToString(),
            ["status"] = asset.Status.ToString()
        };

        return new AiAssetSummary(
            asset.Id,
            asset.Name,
            asset.AssetType?.Name,
            asset.Criticality.ToString(),
            null,
            props);
    }

    private static AiCveSummary ToCveSummary(NvdCve cve)
    {
        var cvssData = cve.Metrics?.CvssMetricV31?.FirstOrDefault()?.CvssData
                    ?? cve.Metrics?.CvssMetricV30?.FirstOrDefault()?.CvssData;

        var description = cve.Descriptions.FirstOrDefault(d => d.Lang == "en")?.Value ?? "";
        if (description.Length > 250)
        {
            description = description[..250] + "...";
        }

        var affectedInfo = FormatAffectedInfo(cve.Configurations);

        return new AiCveSummary(
            cve.Id,
            cvssData?.BaseSeverity,
            cvssData?.BaseScore,
            description,
            affectedInfo);
    }

    private static string FormatAffectedInfo(List<NvdConfiguration>? configurations)
    {
        if (configurations == null || configurations.Count == 0)
        {
            return "unknown";
        }

        var parts = new List<string>();
        foreach (var node in configurations.SelectMany(c => c.Nodes ?? []))
        {
            foreach (var match in node.CpeMatch ?? [])
            {
                if (match?.Criteria == null) continue;

                var cpe = match.Criteria;
                var product = ExtractCpeProduct(cpe);
                if (string.IsNullOrEmpty(product)) continue;

                var versionRange = FormatVersionRange(
                    match.VersionStartIncluding,
                    match.VersionStartExcluding,
                    match.VersionEndIncluding,
                    match.VersionEndExcluding);

                parts.Add(string.IsNullOrEmpty(versionRange) ? product : $"{product} {versionRange}");
            }
        }

        var uniqueParts = parts.Distinct().Take(8).ToList();
        return uniqueParts.Count > 0 ? string.Join(", ", uniqueParts) : "unknown";
    }

    private static string ExtractCpeProduct(string cpe)
    {
        // cpe:2.3:a:vendor:product:version:...:
        var segments = cpe.Split(':');
        if (segments.Length >= 5)
        {
            return $"{segments[3]} {segments[4]}".Trim();
        }
        return "";
    }

    private static string FormatVersionRange(string? startInc, string? startExc, string? endInc, string? endExc)
    {
        var start = !string.IsNullOrEmpty(startInc) ? startInc : (!string.IsNullOrEmpty(startExc) ? $"(excl {startExc})" : null);
        var end = !string.IsNullOrEmpty(endInc) ? endInc : (!string.IsNullOrEmpty(endExc) ? $"(excl {endExc})" : null);

        if (start != null && end != null) return $"{start}-{end}";
        if (start != null) return $">={start}";
        if (end != null) return $"<={end}";
        return "";
    }

    private static List<AiKeywordSuggestion> ParseKeywordSuggestions(string rawResponse, List<AiAssetSummary> assets)
    {
        var suggestions = new List<AiKeywordSuggestion>();
        var assetMap = assets.ToDictionary(a => a.Name, a => a.Id, StringComparer.OrdinalIgnoreCase);

        var json = JsonSerializer.Deserialize<JsonElement>(rawResponse);
        if (json.ValueKind == JsonValueKind.Object && json.TryGetProperty("results", out var resultsProp))
        {
            var results = resultsProp.GetString() ?? "";
            foreach (var line in results.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var match = Regex.Match(line.Trim(), @"^ASSET:(.+?)\|KEYWORDS:(.+)$");
                if (match.Success)
                {
                    var assetName = match.Groups[1].Value.Trim();
                    var keywords = match.Groups[2].Value
                        .Split(',', StringSplitOptions.RemoveEmptyEntries)
                        .Select(k => k.Trim())
                        .Where(k => !string.IsNullOrEmpty(k))
                        .ToList();

                    if (assetMap.TryGetValue(assetName, out var assetId))
                    {
                        suggestions.Add(new AiKeywordSuggestion(assetId, keywords));
                    }
                }
            }
        }

        // Fallback for any missing assets
        foreach (var asset in assets)
        {
            if (!suggestions.Any(s => s.AssetId == asset.Id))
            {
                suggestions.Add(new AiKeywordSuggestion(asset.Id, FallbackKeywordsForAsset(asset)));
            }
        }

        return suggestions;
    }

    private static List<AiKeywordSuggestion> FallbackKeywordSuggestions(List<AiAssetSummary> assets)
    {
        return assets.Select(a => new AiKeywordSuggestion(a.Id, FallbackKeywordsForAsset(a))).ToList();
    }

    private async Task<NvdSearchResult> SearchNvdWithFallbackAsync(List<string> keywords, string? nvdApiKey)
    {
        // Try original keywords
        var result = await _nvdApi.SearchByKeywordsAsync(keywords, nvdApiKey);
        if (result.Vulnerabilities?.Count > 0) return result;

        _logger.LogInformation("NVD returned 0 results for keywords {Keywords}; trying broader versions", keywords);

        // Try without patch-level versions (e.g. 15.4.2 -> 15.4, or "postgresql 15.4" -> "postgresql 15")
        var broadened = keywords.Select(BroadenVersionKeyword).Distinct().ToList();
        if (!broadened.SequenceEqual(keywords))
        {
            result = await _nvdApi.SearchByKeywordsAsync(broadened, nvdApiKey);
            if (result.Vulnerabilities?.Count > 0) return result;
        }

        // Try only the first keyword (usually the product name)
        if (keywords.Count > 1)
        {
            _logger.LogInformation("NVD still 0 results; trying single keyword {Keyword}", keywords[0]);
            result = await _nvdApi.SearchByKeywordsAsync([keywords[0]], nvdApiKey);
            if (result.Vulnerabilities?.Count > 0) return result;
        }

        return result;
    }

    private static string BroadenVersionKeyword(string keyword)
    {
        // "15.4.2" -> "15.4"
        var patchMatch = Regex.Match(keyword, @"^(\d+\.\d+)\.\d+$");
        if (patchMatch.Success) return patchMatch.Groups[1].Value;

        // "postgresql 15.4" -> "postgresql 15"
        var parts = keyword.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 2 && Regex.IsMatch(parts[1], @"^\d+\.\d+$"))
        {
            var major = parts[1].Split('.')[0];
            return $"{parts[0]} {major}";
        }

        return keyword;
    }

    private static List<string> FallbackKeywordsForAsset(AiAssetSummary asset)
    {
        var keywords = new List<string>();
        foreach (var prop in asset.Properties)
        {
            var key = prop.Key.ToLowerInvariant();
            if (key.Contains("package") || key.Contains("software") || key.Contains("application") || key.Contains("os") || key.Contains("operating system"))
            {
                if (prop.Value != null)
                {
                    keywords.Add(prop.Value.ToString()!);
                }
            }
        }
        return keywords;
    }

    private static List<AiScoredResult> ParseScoredResults(string rawResponse, List<AiAssetSummary> assets)
    {
        var results = new List<AiScoredResult>();
        var assetMap = assets.ToDictionary(a => a.Name, a => a.Id, StringComparer.OrdinalIgnoreCase);

        var json = JsonSerializer.Deserialize<JsonElement>(rawResponse);
        if (json.ValueKind == JsonValueKind.Object && json.TryGetProperty("results", out var resultsProp))
        {
            var resultsStr = resultsProp.GetString() ?? "";
            foreach (var line in resultsStr.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var match = Regex.Match(line.Trim(), @"^ASSET:(.+?)\|CVE:(.+?)\|SCORE:(\d+)\|REASON:(.+?)\|MITIGATION:(.*)$");
                if (match.Success)
                {
                    var assetName = match.Groups[1].Value.Trim();
                    var cveId = match.Groups[2].Value.Trim();
                    var score = int.Parse(match.Groups[3].Value);
                    var reason = match.Groups[4].Value.Trim();
                    var mitigation = match.Groups[5].Value.Trim();

                    if (assetMap.TryGetValue(assetName, out var assetId))
                    {
                        results.Add(new AiScoredResult(
                            assetId,
                            cveId,
                            Math.Clamp(score, 0, 100),
                            reason,
                            string.IsNullOrEmpty(mitigation) ? null : mitigation));
                    }
                }
            }
        }

        return results;
    }

    private static bool IsCriticalOrHigh(string? severity)
    {
        return !string.IsNullOrEmpty(severity)
            && (severity.Equals("CRITICAL", StringComparison.OrdinalIgnoreCase)
                || severity.Equals("HIGH", StringComparison.OrdinalIgnoreCase));
    }

    private static AssetCriticality MapSeverityToCriticality(string? severity)
    {
        if (string.IsNullOrEmpty(severity)) return AssetCriticality.Medium;
        return severity.ToUpperInvariant() switch
        {
            "CRITICAL" => AssetCriticality.Critical,
            "HIGH" => AssetCriticality.High,
            "MEDIUM" => AssetCriticality.Medium,
            "LOW" => AssetCriticality.Low,
            _ => AssetCriticality.Medium
        };
    }

    private static DateTime? ParseDate(string? dateString)
    {
        if (string.IsNullOrEmpty(dateString)) return null;
        if (DateTime.TryParse(dateString, out var dt))
        {
            return DateTime.SpecifyKind(dt, DateTimeKind.Utc);
        }
        return null;
    }
}
