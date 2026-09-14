using backend.Data;
using backend.Infrastructure.Pagination;
using backend.Models.Dtos;
using backend.Models.Entities;
using backend.Models.Enums;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

[ApiController]
[Route("api/vulnerabilities")]
[Authorize]
public class VulnerabilitiesController : TenantControllerBase
{
    private readonly IAuditLogService _audit;

    public VulnerabilitiesController(AppDbContext db, UserManager<AppUser> userManager, IAuditLogService audit)
        : base(db, userManager)
    {
        _audit = audit;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] string? severity,
        [FromQuery] string? status,
        [FromQuery] Guid? assetTypeId,
        [FromQuery] string? attackVector,
        [FromQuery] string? privilegesRequired,
        [FromQuery] string? userInteraction,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortOrder,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        var query = _db.AssetVulnerabilities
            .Include(av => av.Vulnerability)
            .Include(av => av.Asset)
                .ThenInclude(a => a.AssetType)
            .Where(av => av.OrganizationId == orgId.Value)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(severity))
            // Severity is stored uppercase ("CRITICAL"); compare case-insensitively
            query = query.Where(av => av.Vulnerability.Severity != null && av.Vulnerability.Severity.ToLower() == severity.ToLower());

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(av => av.Status == status);

        if (assetTypeId.HasValue)
            query = query.Where(av => av.Asset.AssetTypeId == assetTypeId.Value);

        if (!string.IsNullOrWhiteSpace(attackVector))
            query = query.Where(av => av.Vulnerability.AttackVector != null && av.Vulnerability.AttackVector.ToLower() == attackVector.ToLower());

        if (!string.IsNullOrWhiteSpace(privilegesRequired))
            query = query.Where(av => av.Vulnerability.PrivilegesRequired != null && av.Vulnerability.PrivilegesRequired.ToLower() == privilegesRequired.ToLower());

        if (!string.IsNullOrWhiteSpace(userInteraction))
            query = query.Where(av => av.Vulnerability.UserInteraction != null && av.Vulnerability.UserInteraction.ToLower() == userInteraction.ToLower());

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(av =>
                av.Vulnerability.CveId.ToLower().Contains(term) ||
                (av.Vulnerability.Description != null && av.Vulnerability.Description.ToLower().Contains(term)));
        }

        var descending = sortOrder?.ToLower() != "asc";
        var ordered = sortBy?.ToLower() switch
        {
            "detected" => descending
                ? query.OrderByDescending(av => av.DetectedAt).ThenBy(av => av.Vulnerability.CveId)
                : query.OrderBy(av => av.DetectedAt).ThenBy(av => av.Vulnerability.CveId),
            "published" => descending
                ? query.OrderByDescending(av => av.Vulnerability.PublishedDate).ThenBy(av => av.Vulnerability.CveId)
                : query.OrderBy(av => av.Vulnerability.PublishedDate).ThenBy(av => av.Vulnerability.CveId),
            "cveid" => descending
                ? query.OrderByDescending(av => av.Vulnerability.CveId)
                : query.OrderBy(av => av.Vulnerability.CveId),
            // Default: severity rank (Critical > High > Medium > Low), then CVSS DESC, then CveId ASC
            // so pagination is stable across pages.
            _ => query
                .OrderByDescending(av =>
                    av.Vulnerability.Severity != null && av.Vulnerability.Severity.ToLower() == "critical" ? 4 :
                    av.Vulnerability.Severity != null && av.Vulnerability.Severity.ToLower() == "high" ? 3 :
                    av.Vulnerability.Severity != null && av.Vulnerability.Severity.ToLower() == "medium" ? 2 :
                    av.Vulnerability.Severity != null && av.Vulnerability.Severity.ToLower() == "low" ? 1 : 0)
                .ThenByDescending(av => av.Vulnerability.CvssScore)
                .ThenBy(av => av.Vulnerability.CveId)
        };

        var result = await ordered
            .Select(av => new VulnerabilityListItemResponse
            {
                AssetId = av.AssetId,
                AssetName = av.Asset.Name,
                AssetTypeName = av.Asset.AssetType.Name,
                VulnerabilityId = av.VulnerabilityId,
                CveId = av.Vulnerability.CveId,
                Description = av.Vulnerability.Description,
                CvssScore = av.Vulnerability.CvssScore,
                Severity = av.Vulnerability.Severity,
                AttackVector = av.Vulnerability.AttackVector,
                PrivilegesRequired = av.Vulnerability.PrivilegesRequired,
                UserInteraction = av.Vulnerability.UserInteraction,
                PublishedDate = av.Vulnerability.PublishedDate,
                DetectedAt = av.DetectedAt,
                Status = av.Status,
                MatchedKeyword = av.MatchedKeyword,
                AiRelevanceScore = av.AiRelevanceScore,
                AiSuggestedMitigation = av.Vulnerability.AiSuggestedMitigation
            })
            .ToPagedResultAsync(page, pageSize);

        // Org-wide stats for the current filter set, as SQL aggregates (not row loads).
        var stats = new VulnerabilityListStats
        {
            Active = await query.CountAsync(av => av.Status == "Active"),
            Critical = await query.CountAsync(av => av.Vulnerability.Severity != null && av.Vulnerability.Severity.ToLower() == "critical"),
            High = await query.CountAsync(av => av.Vulnerability.Severity != null && av.Vulnerability.Severity.ToLower() == "high")
        };

        return Ok(new VulnerabilityListResponse
        {
            Items = result.Items,
            TotalCount = result.TotalCount,
            Page = result.Page,
            PageSize = result.PageSize,
            Stats = stats
        });
    }

    [HttpGet("count")]
    public async Task<IActionResult> GetCount(
        [FromQuery] string? search,
        [FromQuery] string? severity,
        [FromQuery] string? status,
        [FromQuery] Guid? assetTypeId,
        [FromQuery] string? attackVector,
        [FromQuery] string? privilegesRequired,
        [FromQuery] string? userInteraction)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var query = _db.AssetVulnerabilities
            .Where(av => av.OrganizationId == orgId.Value)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(severity)) query = query.Where(av => av.Vulnerability.Severity == severity);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(av => av.Status == status);
        if (assetTypeId.HasValue) query = query.Where(av => av.Asset.AssetTypeId == assetTypeId.Value);
        if (!string.IsNullOrWhiteSpace(attackVector)) query = query.Where(av => av.Vulnerability.AttackVector != null && av.Vulnerability.AttackVector.ToLower() == attackVector.ToLower());
        if (!string.IsNullOrWhiteSpace(privilegesRequired)) query = query.Where(av => av.Vulnerability.PrivilegesRequired != null && av.Vulnerability.PrivilegesRequired.ToLower() == privilegesRequired.ToLower());
        if (!string.IsNullOrWhiteSpace(userInteraction)) query = query.Where(av => av.Vulnerability.UserInteraction != null && av.Vulnerability.UserInteraction.ToLower() == userInteraction.ToLower());
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(av =>
                av.Vulnerability.CveId.ToLower().Contains(term) ||
                (av.Vulnerability.Description != null && av.Vulnerability.Description.ToLower().Contains(term)));
        }

        var count = await query.CountAsync();
        return Ok(new { count });
    }

    [HttpGet("vectors")]
    public async Task<IActionResult> GetVectorOptions()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var vectors = await _db.AssetVulnerabilities
            .Where(av => av.OrganizationId == orgId.Value)
            .Select(av => new
            {
                av.Vulnerability.AttackVector,
                av.Vulnerability.PrivilegesRequired,
                av.Vulnerability.UserInteraction
            })
            .Distinct()
            .ToListAsync();

        return Ok(new
        {
            attackVectors = vectors.Select(v => v.AttackVector).Where(v => !string.IsNullOrWhiteSpace(v)).Distinct().OrderBy(v => v),
            privilegesRequired = vectors.Select(v => v.PrivilegesRequired).Where(v => !string.IsNullOrWhiteSpace(v)).Distinct().OrderBy(v => v),
            userInteractions = vectors.Select(v => v.UserInteraction).Where(v => !string.IsNullOrWhiteSpace(v)).Distinct().OrderBy(v => v)
        });
    }

    [HttpPatch("bulk-status")]
    public async Task<IActionResult> BulkUpdateStatus([FromBody] BulkUpdateVulnerabilityStatusRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst);
        if (auth != null) return auth;

        if (request.VulnerabilityIds == null || request.VulnerabilityIds.Count == 0)
            return BadRequest(new { message = "No vulnerability IDs provided" });

        var ids = request.VulnerabilityIds.Distinct().ToList();

        // Get CVE IDs for audit logging
        var cveIds = await _db.AssetVulnerabilities
            .Where(av => ids.Contains(av.VulnerabilityId) && av.OrganizationId == orgId.Value)
            .Select(av => av.Vulnerability.CveId)
            .ToListAsync();

        await _db.AssetVulnerabilities
            .Where(av => ids.Contains(av.VulnerabilityId) && av.OrganizationId == orgId.Value)
            .ExecuteUpdateAsync(setters => setters.SetProperty(av => av.Status, request.Status));

        await _audit.LogAsync("VulnerabilityBulkStatusChanged", "Vulnerability", string.Join(",", cveIds.Take(5)),
            new { Count = ids.Count, OldStatus = "various" },
            new { Count = ids.Count, NewStatus = request.Status });

        return NoContent();
    }
}
