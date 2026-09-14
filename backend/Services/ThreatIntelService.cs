using backend.Data;
using System.Text.Json;
using System.Text.RegularExpressions;
using backend.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace backend.Services;

public interface IThreatIntelService
{
    Task<ThreatIntelBrief> GenerateBriefAsync(Guid orgId, ThreatIntelBriefOptions options, CancellationToken ct = default);

    /// <summary>Builds the DeepResearch research brief from the org's inventory. Null when the org has nothing to audit.</summary>
    Task<string?> BuildAuditBriefAsync(Guid orgId, int sinceDays, CancellationToken ct = default);
}

/// <summary>
/// Builds a cited threat-intel brief for an organization: plans targeted Valyu searches
/// from the org's own assets and known CVEs, runs them in parallel, optionally re-ranks
/// findings against the inventory with OpenRouter, and returns everything with citations.
/// </summary>
public class ThreatIntelService : IThreatIntelService
{
    // Empirically, Valyu's "cybersecurity" preset resolves to its NVD CVE corpus, whose records
    // carry no publication dates — a date window then filters everything out. Fresh-intel
    // queries therefore run unscoped against the open web with a date window instead; the
    // labels below are display-only.
    private const string FreshIntelLabel = "web-intel";
    private const string ComplianceLabel = "compliance";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);

    private readonly AppDbContext _db;
    private readonly IValyuService _valyu;
    private readonly IOpenRouterService _openRouter;
    private readonly IMemoryCache _cache;
    private readonly ILogger<ThreatIntelService> _logger;

    public ThreatIntelService(AppDbContext db, IValyuService valyu, IOpenRouterService openRouter,
        IMemoryCache cache, ILogger<ThreatIntelService> logger)
    {
        _db = db;
        _valyu = valyu;
        _openRouter = openRouter;
        _cache = cache;
        _logger = logger;
    }

    public async Task<ThreatIntelBrief> GenerateBriefAsync(Guid orgId, ThreatIntelBriefOptions options, CancellationToken ct = default)
    {
        var sinceDays = Math.Clamp(options.SinceDays, 1, 30);
        var maxQueries = Math.Clamp(options.MaxQueries, 3, 10);

        var cacheKey = $"intel-brief:{orgId}:{sinceDays}:{maxQueries}:{options.UseAiRerank}";
        if (_cache.TryGetValue(cacheKey, out ThreatIntelBrief? cached) && cached != null)
            return cached;

        var org = await _db.Organizations.FindAsync([orgId], ct);
        if (org == null)
            throw new InvalidOperationException("Organization not found.");

        var planned = await PlanQueriesAsync(orgId, maxQueries, ct);
        if (planned.Count == 0)
        {
            return new ThreatIntelBrief
            {
                GeneratedAt = DateTime.UtcNow,
                SinceDays = sinceDays,
                Notice = "No assets or active CVEs to base a brief on. Add assets and run a CVE scan first."
            };
        }

        var startDate = DateTime.UtcNow.AddDays(-sinceDays).ToString("yyyy-MM-dd");
        var endDate = DateTime.UtcNow.ToString("yyyy-MM-dd");

        var searchTasks = planned.Select(p => _valyu.SearchAsync(new ValyuSearchRequest
        {
            Query = p.Query,
            MaxNumResults = 5,
            StartDate = startDate,
            EndDate = endDate,
            RelevanceThreshold = 0.5
        }, ct)).ToList();

        var responses = await Task.WhenAll(searchTasks);

        var brief = new ThreatIntelBrief
        {
            GeneratedAt = DateTime.UtcNow,
            SinceDays = sinceDays,
            TotalCostUsd = responses.Where(r => r.TotalDeductionDollars.HasValue).Sum(r => r.TotalDeductionDollars!.Value)
        };

        var knownCves = planned.SelectMany(p => p.KnownCves).ToHashSet(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < planned.Count; i++)
        {
            var plan = planned[i];
            var response = responses[i];

            // "all"-source searches can still land in corpora whose records carry no
            // publication dates (e.g. proprietary CVE databases), so the date window can
            // zero a query out. Retry such queries once undated before giving up on them.
            if (response.Success && response.Results.Count == 0)
            {
                var undated = await _valyu.SearchAsync(new ValyuSearchRequest
                {
                    Query = plan.Query,
                    MaxNumResults = 5,
                    RelevanceThreshold = 0.5
                }, ct);
                if (undated.Success && undated.Results.Count > 0)
                {
                    response = undated;
                    if (undated.TotalDeductionDollars.HasValue)
                        brief.TotalCostUsd += undated.TotalDeductionDollars.Value;
                }
            }

            brief.Queries.Add(new ThreatIntelQueryRecord
            {
                Query = plan.Query,
                Preset = plan.Preset,
                ResultCount = response.Results.Count,
                Error = response.Error ??
                    (response.Results.Count == 0 && response.Warnings is { Count: > 0 }
                        ? response.Warnings[0]
                        : null)
            });

            if (!response.Success)
            {
                _logger.LogWarning("Valyu query failed for brief: {Query}: {Error}", plan.Query, response.Error);
                continue;
            }

            foreach (var item in response.Results)
            {
                var text = $"{item.Title} {item.Content} {item.Description}";
                var finding = new ThreatIntelFinding
                {
                    Title = item.Title ?? item.Url ?? "(untitled result)",
                    Url = item.Url,
                    Snippet = Truncate(item.Content ?? item.Description ?? "", 300),
                    Source = item.Source,
                    PublicationDate = item.PublicationDate,
                    RelevanceScore = item.RelevanceScore,
                    Preset = plan.Preset,
                    MatchedAssets = plan.AssetNames,
                    MatchedCves = knownCves.Count > 0
                        ? Regex.Matches(text, @"CVE-\d{4}-\d{4,7}", RegexOptions.IgnoreCase)
                            .Select(m => m.Value.ToUpperInvariant())
                            .Where(knownCves.Contains)
                            .Distinct()
                            .ToList()
                        : []
                };
                if (plan.KnownCves.Count > 0)
                    finding.MatchedCves = finding.MatchedCves.Union(plan.KnownCves).ToList();

                brief.Findings.Add(finding);
            }
        }

        brief.Findings = brief.Findings
            .GroupBy(f => f.Url ?? f.Title, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToList();

        // Don't cache a brief where every query failed — the user may have fixed the
        // key/credits and should get fresh calls on the next click, not the cached failure.
        var anyQuerySucceeded = brief.Queries.Any(q => q.Error == null);

        var wantsRerank = options.UseAiRerank && org.IsAiEnabled;
        if (wantsRerank && brief.Findings.Count > 0)
        {
            await ApplyAiRerankAsync(org, brief, ct);
        }

        if (brief.Findings.Count == 0)
        {
            var failure = brief.Queries.FirstOrDefault(q => q.Error != null)?.Error;
            brief.Notice = failure ?? $"No fresh intel found for your stack in the last {sinceDays} days.";
        }

        brief.AiRerankApplied = brief.Findings.Any(f => f.AiRelevanceScore.HasValue);

        if (anyQuerySucceeded)
        {
            _cache.Set(cacheKey, brief, CacheTtl);
        }
        return brief;
    }

    /// <summary>Builds the query plan: product queries from assets, exploit queries from top active CVEs, one compliance sweep.</summary>
    private async Task<List<PlannedQuery>> PlanQueriesAsync(Guid orgId, int maxQueries, CancellationToken ct)
    {
        var planned = new List<PlannedQuery>();

        var assets = await _db.Assets
            .Include(a => a.AssetType)
                .ThenInclude(at => at.Fields)
            .Where(a => a.OrganizationId == orgId)
            .OrderByDescending(a => a.HighestCvssScore)
            .ThenByDescending(a => a.UpdatedAt)
            .Take(50)
            .ToListAsync(ct);

        var productBudget = Math.Max(1, maxQueries / 2);
        var seenPairs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var asset in assets)
        {
            if (planned.Count >= productBudget) break;

            var searchableValues = asset.AssetType.Fields
                .Where(f => f.IsCveSearchable)
                .OrderBy(f => f.DisplayOrder)
                .Where(f => asset.Properties.TryGetValue(f.Name, out var v) && v != null)
                .Select(f => asset.Properties[f.Name].ToString()!.Trim())
                .Where(v => v.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(2)
                .ToList();

            if (searchableValues.Count == 0) continue;

            var key = string.Join("|", searchableValues);
            if (!seenPairs.Add(key)) continue;

            planned.Add(new PlannedQuery
            {
                Query = $"{string.Join(" ", searchableValues)} security vulnerability exploit",
                Preset = FreshIntelLabel,
                AssetNames = [asset.Name],
                KnownCves = []
            });
        }

        var cveBudget = Math.Max(0, maxQueries - planned.Count - 1);
        if (cveBudget > 0)
        {
            var topCves = await _db.AssetVulnerabilities
                .Where(av => av.OrganizationId == orgId && av.Status == "Active")
                .Join(_db.Vulnerabilities,
                    av => av.VulnerabilityId,
                    v => v.Id,
                    (av, v) => new { v.CveId, v.CvssScore })
                .GroupBy(x => x.CveId)
                .Select(g => new { CveId = g.Key, Score = g.Max(x => x.CvssScore) })
                .OrderByDescending(x => x.Score)
                .Take(cveBudget)
                .ToListAsync(ct);

            foreach (var cve in topCves)
            {
                planned.Add(new PlannedQuery
                {
                    Query = $"{cve.CveId} actively exploited in the wild",
                    Preset = FreshIntelLabel,
                    AssetNames = [],
                    KnownCves = [cve.CveId.ToUpperInvariant()]
                });
            }
        }

        if (planned.Count < maxQueries)
        {
            planned.Add(new PlannedQuery
            {
                Query = "new cybersecurity compliance and disclosure requirement changes",
                Preset = ComplianceLabel,
                AssetNames = [],
                KnownCves = []
            });
        }

        return planned;
    }

    /// <summary>
    /// Builds a DeepResearch research brief scoped to the org's inventory: assets grouped
    /// by product, the active CVE list, and the required audit report structure.
    /// Returns null when the org has no assets to audit.
    /// </summary>
    public async Task<string?> BuildAuditBriefAsync(Guid orgId, int sinceDays, CancellationToken ct = default)
    {
        var windowDays = Math.Clamp(sinceDays, 1, 90);
        var org = await _db.Organizations.FindAsync([orgId], ct);
        if (org == null) return null;

        var assets = await _db.Assets
            .Include(a => a.AssetType).ThenInclude(at => at.Fields)
            .Where(a => a.OrganizationId == orgId)
            .OrderByDescending(a => a.Criticality)
            .ThenBy(a => a.Name)
            .Take(60)
            .ToListAsync(ct);

        if (assets.Count == 0) return null;

        var inventoryLines = assets.Select(a =>
        {
            var values = a.AssetType.Fields
                .Where(f => f.IsCveSearchable)
                .OrderBy(f => f.DisplayOrder)
                .Where(f => a.Properties.TryGetValue(f.Name, out var v) && v != null)
                .Select(f => $"{f.Name}: {a.Properties[f.Name]}")
                .Take(4);
            return $"- {a.Name} ({a.AssetType.Name}{(values.Any() ? $": {string.Join(", ", values)}" : "")}, criticality: {a.Criticality})";
        }).ToList();

        var cves = await _db.AssetVulnerabilities
            .Where(av => av.OrganizationId == orgId && av.Status != "Mitigated")
            .Join(_db.Vulnerabilities,
                av => av.VulnerabilityId,
                v => v.Id,
                (av, v) => new { av.Status, v.CveId, v.CvssScore, v.Severity })
            .GroupBy(x => x.CveId)
            .Select(g => new
            {
                CveId = g.Key,
                Score = g.Max(x => x.CvssScore),
                Severity = g.Max(x => x.Severity),
                Status = g.Select(x => x.Status).FirstOrDefault()
            })
            .OrderByDescending(x => x.Score)
            .Take(20)
            .ToListAsync(ct);

        var cveLines = cves.Select(c => $"- {c.CveId} (CVSS {c.Score?.ToString("0.0") ?? "?"} {c.Severity}, triage: {c.Status})").ToList();

        var inventoryText = string.Join("\n", inventoryLines);
        var cveText = cveLines.Count > 0 ? string.Join("\n", cveLines) : "- (none)";

        return $"""
            Produce a security posture audit for the following organization's asset inventory, as of today.

            ORGANIZATION: {org.Name}
            ASSET INVENTORY ({assets.Count} assets):
            {inventoryText}

            KNOWN VULNERABILITIES ALREADY IN THEIR TRIAGE QUEUE:
            {cveText}

            Focus on the last {windowDays} days for anything time-sensitive (fresh exploitation, new advisories, patches, compliance changes), but cover standing risk for the products listed.
            """;
    }

    /// <summary>Scores findings 0-100 against the org's inventory via OpenRouter. Degrades silently on any failure.</summary>
    private async Task ApplyAiRerankAsync(Organization org, ThreatIntelBrief brief, CancellationToken ct)
    {
        try
        {
            var inventory = await _db.Assets
                .Include(a => a.AssetType).ThenInclude(at => at.Fields)
                .Where(a => a.OrganizationId == org.Id)
                .OrderByDescending(a => a.HighestCvssScore)
                .Take(25)
                .ToListAsync(ct);

            var inventoryLines = inventory.Select(a =>
            {
                var values = a.AssetType.Fields
                    .Where(f => f.IsCveSearchable)
                    .OrderBy(f => f.DisplayOrder)
                    .Where(f => a.Properties.TryGetValue(f.Name, out var v) && v != null)
                    .Select(f => a.Properties[f.Name].ToString()!.Trim())
                    .Take(4);
                return $"- {a.Name} ({a.AssetType.Name}): {string.Join(", ", values)}";
            }).ToList();

            var findingsText = string.Join("\n", brief.Findings.Select((f, i) =>
                $"{i}. [{f.Preset}] {f.Title} :: {Truncate(f.Snippet ?? "", 200)}"));

            var prompt = $@"You are a cybersecurity threat-intel analyst. Score how relevant and actionable each search result is to THIS organization's specific asset inventory, 0-100. 100 = directly about a product/version the org runs or a CVE assigned to its assets. Score low for generic news that mentions nothing in the inventory.

ORGANIZATION: {org.Name}
ASSET INVENTORY:
{string.Join("\n", inventoryLines)}

SEARCH RESULTS:
{findingsText}

Respond with strict JSON only, no markdown: {{""scores"":[{{""index"":0,""score"":85}},...]}} covering every result index.";

            var reply = await _openRouter.ChatAsync(prompt, requireJson: true, ct);
            var json = Regex.Replace(reply, @"^```(?:json)?|```$", "", RegexOptions.Multiline).Trim();
            var parsed = JsonSerializer.Deserialize<AiRerankResponse>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (parsed?.Scores == null) return;

            foreach (var entry in parsed.Scores)
            {
                if (entry.Index < 0 || entry.Index >= brief.Findings.Count) continue;
                brief.Findings[entry.Index].AiRelevanceScore = Math.Clamp(entry.Score, 0, 100);
            }

            brief.Findings = brief.Findings
                .OrderByDescending(f => f.AiRelevanceScore ?? f.RelevanceScore * 100 ?? 0)
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "AI rerank failed; returning brief without AI scores.");
        }
    }

    private static string Truncate(string text, int maxLength)
    {
        if (text.Length <= maxLength) return text;
        var cut = text[..maxLength];
        var lastSpace = cut.LastIndexOf(' ');
        return (lastSpace > maxLength / 2 ? cut[..lastSpace] : cut) + "…";
    }

    private class PlannedQuery
    {
        public string Query { get; set; } = "";
        public string Preset { get; set; } = FreshIntelLabel;
        public List<string> AssetNames { get; set; } = [];
        public List<string> KnownCves { get; set; } = [];
    }

    private class AiRerankResponse
    {
        public List<AiRerankEntry>? Scores { get; set; }
    }

    private class AiRerankEntry
    {
        public int Index { get; set; }
        public int Score { get; set; }
    }
}

public class ThreatIntelBriefOptions
{
    public int SinceDays { get; set; } = 7;
    public bool UseAiRerank { get; set; } = true;
    public int MaxQueries { get; set; } = 6;
}

public class ThreatIntelBrief
{
    public DateTime GeneratedAt { get; set; }
    public int SinceDays { get; set; }
    public List<ThreatIntelQueryRecord> Queries { get; set; } = [];
    public List<ThreatIntelFinding> Findings { get; set; } = [];
    public decimal TotalCostUsd { get; set; }
    public bool AiRerankApplied { get; set; }

    /// <summary>Human-readable warning or refusal (e.g. "no fresh intel") when the brief came back thin.</summary>
    public string? Notice { get; set; }
}

public class ThreatIntelQueryRecord
{
    public string Query { get; set; } = "";
    public string Preset { get; set; } = "";
    public int ResultCount { get; set; }
    public string? Error { get; set; }
}

public class ThreatIntelFinding
{
    public string Title { get; set; } = "";
    public string? Url { get; set; }
    public string? Snippet { get; set; }
    public string? Source { get; set; }
    public string? PublicationDate { get; set; }

    /// <summary>Valyu's semantic relevance, 0-1.</summary>
    public double? RelevanceScore { get; set; }

    /// <summary>OpenRouter rerank vs the org's inventory, 0-100. Null when rerank is off or failed.</summary>
    public double? AiRelevanceScore { get; set; }

    public string Preset { get; set; } = "";
    public List<string> MatchedCves { get; set; } = [];
    public List<string> MatchedAssets { get; set; } = [];
}
