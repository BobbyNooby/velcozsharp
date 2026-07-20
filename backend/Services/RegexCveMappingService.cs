using backend.Data;
using backend.Models.Entities;
using backend.Models.Enums;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace backend.Services;

public interface ICveMappingService
{
    Task<List<AssetVulnerability>> ScanAssetAsync(Guid assetId, Guid organizationId, CancellationToken ct = default);
}

public class RegexCveMappingService : ICveMappingService
{
    private readonly AppDbContext _db;
    private readonly INvdApiService _nvdApi;
    private readonly INotificationService _notifications;
    private readonly ILogger<RegexCveMappingService> _logger;

    public RegexCveMappingService(AppDbContext db, INvdApiService nvdApi, INotificationService notifications, ILogger<RegexCveMappingService> logger)
    {
        _db = db;
        _nvdApi = nvdApi;
        _notifications = notifications;
        _logger = logger;
    }

    public async Task<List<AssetVulnerability>> ScanAssetAsync(Guid assetId, Guid organizationId, CancellationToken ct = default)
    {
        _db.CurrentOrganizationId = organizationId;

        var asset = await _db.Assets
            .Include(a => a.AssetType)
                .ThenInclude(at => at.Fields)
            .FirstOrDefaultAsync(a => a.Id == assetId, ct);

        if (asset == null)
            throw new ArgumentException($"Asset {assetId} not found");

        // Extract searchable properties
        var searchableFields = asset.AssetType.Fields.Where(f => f.IsCveSearchable).ToList();
        var keywords = new List<string>();

        foreach (var field in searchableFields)
        {
            if (asset.Properties.TryGetValue(field.Name, out var value) && value != null)
            {
                keywords.Add(value.ToString()!);
            }
        }

        if (keywords.Count == 0)
        {
            _logger.LogWarning("Asset {AssetId} has no CVE-searchable properties", assetId);
            return [];
        }

        _logger.LogInformation("Scanning asset {AssetName} with keywords: {Keywords}", asset.Name, string.Join(", ", keywords));

        // Query NVD
        var org = await _db.Organizations.FindAsync([organizationId], ct);
        var nvdResult = await _nvdApi.SearchByKeywordsAsync(keywords, org?.NvdApiKey, ct);

        // If no results with all keywords, try with fewer (product + version only)
        if ((nvdResult.Vulnerabilities == null || nvdResult.Vulnerabilities.Count == 0) && keywords.Count > 2)
        {
            var reducedKeywords = keywords.Take(2).ToList();
            _logger.LogInformation("No results with all keywords, trying reduced: {Keywords}", string.Join(", ", reducedKeywords));
            nvdResult = await _nvdApi.SearchByKeywordsAsync(reducedKeywords, org?.NvdApiKey, ct);
        }

        if (nvdResult.Vulnerabilities == null || nvdResult.Vulnerabilities.Count == 0)
        {
            _logger.LogInformation("No CVEs found for asset {AssetName}", asset.Name);
            
            // Update last scanned even if no results
            asset.LastScannedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
            
            return [];
        }

        var matches = new List<AssetVulnerability>();
        var newCriticalOrHighCveIds = new List<string>();
        double? highestCvss = null;
        string? highestSeverity = null;

        foreach (var vuln in nvdResult.Vulnerabilities)
        {
            var cve = vuln.Cve;
            var cvssData = cve.Metrics?.CvssMetricV31?.FirstOrDefault()?.CvssData
                        ?? cve.Metrics?.CvssMetricV30?.FirstOrDefault()?.CvssData;

            // Regex relevance check: does the CVE description contain any of our keywords?
            var description = cve.Descriptions.FirstOrDefault(d => d.Lang == "en")?.Value ?? "";
            var isRelevant = IsRelevant(description, keywords, asset.Properties);

            if (!isRelevant)
            {
                _logger.LogDebug("CVE {CveId} filtered out by regex relevance check", cve.Id);
                continue;
            }

            // Deduplication: check if we already have this CVE
            var existingVuln = await _db.Vulnerabilities.FirstOrDefaultAsync(v => v.CveId == cve.Id, ct);
            if (existingVuln == null)
            {
                existingVuln = new Vulnerability
                {
                    Id = Guid.NewGuid(),
                    CveId = cve.Id,
                    Description = description.Length > 2000 ? description[..2000] : description,
                    CvssScore = cvssData?.BaseScore,
                    Severity = cvssData?.BaseSeverity,
                    PublishedDate = ParseDate(cve.Published),
                    FetchedAt = DateTime.UtcNow
                };
                _db.Vulnerabilities.Add(existingVuln);
            }

            // Check if already linked to this asset
            var existingLink = await _db.AssetVulnerabilities
                .FirstOrDefaultAsync(av => av.AssetId == assetId && av.VulnerabilityId == existingVuln.Id, ct);

            if (existingLink == null)
            {
                var matchedKeyword = FindMatchedKeyword(description, keywords);

                var link = new AssetVulnerability
                {
                    AssetId = assetId,
                    VulnerabilityId = existingVuln.Id,
                    OrganizationId = organizationId,
                    DetectedAt = DateTime.UtcNow,
                    Status = "Active",
                    MatchedKeyword = matchedKeyword
                };
                _db.AssetVulnerabilities.Add(link);
                matches.Add(link);

                if (IsCriticalOrHigh(cvssData?.BaseSeverity))
                {
                    newCriticalOrHighCveIds.Add(cve.Id);
                }
            }
            else
            {
                matches.Add(existingLink);
            }

            // Track highest severity
            if (cvssData?.BaseScore > highestCvss)
            {
                highestCvss = cvssData.BaseScore;
                highestSeverity = cvssData.BaseSeverity;
            }
        }

        // Update asset cached risk
        asset.HighestCvssScore = highestCvss;
        asset.HighestSeverity = highestSeverity;
        asset.LastScannedAt = DateTime.UtcNow;

        if (asset.IsCriticalityAuto)
        {
            asset.Criticality = MapSeverityToCriticality(highestSeverity);
        }

        await _db.SaveChangesAsync(ct);

        if (newCriticalOrHighCveIds.Count > 0)
        {
            await _notifications.NotifyCriticalVulnerabilityAsync(
                organizationId,
                assetId,
                asset.Name,
                newCriticalOrHighCveIds);
        }

        _logger.LogInformation(
            "Scan complete for {AssetName}: {NewMatches} new, {Total} total CVEs matched",
            asset.Name, matches.Count(m => m.DetectedAt > DateTime.UtcNow.AddMinutes(-1)), matches.Count);

        return matches;
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

    private static bool IsRelevant(string description, List<string> keywords, Dictionary<string, object> properties)
    {
        description = description.ToLowerInvariant();

        // Must contain at least one keyword
        var hasKeyword = keywords.Any(k => description.Contains(k.ToLowerInvariant()));
        if (!hasKeyword) return false;

        // Check version indicators if version is in properties
        foreach (var prop in properties)
        {
            var key = prop.Key.ToLowerInvariant();
            if ((key.Contains("version") || key.Contains("ver")) && prop.Value != null)
            {
                var version = prop.Value.ToString()!.ToLowerInvariant();
                // Simple version string check in description
                if (description.Contains(version)) return true;
            }
        }

        // If no version match, at least require a product name match
        return hasKeyword;
    }

    private static string? FindMatchedKeyword(string description, List<string> keywords)
    {
        description = description.ToLowerInvariant();
        foreach (var keyword in keywords)
        {
            if (description.Contains(keyword.ToLowerInvariant()))
                return keyword;
        }
        return null;
    }

    private static DateTime? ParseDate(string? dateString)
    {
        if (string.IsNullOrEmpty(dateString)) return null;
        if (DateTime.TryParse(dateString, out var dt))
        {
            // NVD dates are UTC but parsed as Unspecified — force UTC kind for PostgreSQL
            return DateTime.SpecifyKind(dt, DateTimeKind.Utc);
        }
        return null;
    }
}
