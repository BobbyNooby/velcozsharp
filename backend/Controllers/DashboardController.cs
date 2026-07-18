using backend.Data;
using backend.Models.Dtos;
using backend.Models.Entities;
using backend.Models.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

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
