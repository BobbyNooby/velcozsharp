using backend.Data;
using backend.Models.Entities;
using backend.Models.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

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

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : TenantControllerBase
{
    public DashboardController(AppDbContext db, UserManager<AppUser> userManager)
        : base(db, userManager)
    {
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        // Asset counts
        var totalAssets = await _db.Assets
            .CountAsync(a => a.OrganizationId == orgId.Value && a.Status != AssetStatus.Decommissioned);

        // Vulnerability severity breakdown
        var vulnQuery = _db.AssetVulnerabilities
            .Where(av => av.OrganizationId == orgId.Value)
            .Include(av => av.Vulnerability);

        var totalVulnerabilities = await vulnQuery.CountAsync();
        var activeVulnerabilities = await vulnQuery.CountAsync(av => av.Status == "Active");

        var severityBreakdown = await vulnQuery
            .Where(av => av.Vulnerability.Severity != null)
            .GroupBy(av => av.Vulnerability.Severity!)
            .Select(g => new { Severity = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Severity, x => x.Count);

        // Highest risk assets (top 5 by CVSS score)
        var highestRiskAssets = await _db.Assets
            .Where(a => a.OrganizationId == orgId.Value && a.Status != AssetStatus.Decommissioned)
            .Where(a => a.HighestCvssScore != null)
            .OrderByDescending(a => a.HighestCvssScore)
            .Take(5)
            .Select(a => new HighestRiskAssetResponse
            {
                Id = a.Id,
                Name = a.Name,
                AssetTypeName = a.AssetType.Name,
                HighestCvssScore = a.HighestCvssScore,
                HighestSeverity = a.HighestSeverity,
                VulnerabilityCount = a.Vulnerabilities.Count
            })
            .ToListAsync();

        // Recent scan activity (last 5 scanned assets)
        var recentScanActivity = await _db.Assets
            .Where(a => a.OrganizationId == orgId.Value && a.Status != AssetStatus.Decommissioned)
            .Where(a => a.LastScannedAt != null)
            .OrderByDescending(a => a.LastScannedAt)
            .Take(5)
            .Select(a => new RecentScanActivityResponse
            {
                AssetId = a.Id,
                AssetName = a.Name,
                LastScannedAt = a.LastScannedAt,
                VulnerabilitiesFound = a.Vulnerabilities.Count
            })
            .ToListAsync();

        return Ok(new DashboardStatsResponse
        {
            TotalAssets = totalAssets,
            TotalVulnerabilities = totalVulnerabilities,
            ActiveVulnerabilities = activeVulnerabilities,
            SeverityBreakdown = severityBreakdown,
            HighestRiskAssets = highestRiskAssets,
            RecentScanActivity = recentScanActivity
        });
    }
}
