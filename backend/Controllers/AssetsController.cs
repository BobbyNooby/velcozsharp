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
[Route("api/assets")]
[Authorize]
public class AssetsController : TenantControllerBase
{
    private readonly IAssetValidationService _validation;
    private readonly IAuditLogService _audit;

    public AssetsController(AppDbContext db, UserManager<AppUser> userManager, IAssetValidationService validation, IAuditLogService audit)
        : base(db, userManager)
    {
        _validation = validation;
        _audit = audit;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? departmentId,
        [FromQuery] Guid? assetTypeId,
        [FromQuery] AssetStatus? status,
        [FromQuery] string? severity,
        [FromQuery] string? criticality,
        [FromQuery] string? tag,
        [FromQuery] string? search,
        [FromQuery] bool? hasVulnerabilities,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortOrder,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        var query = _db.Assets
            .Include(a => a.AssetType)
            .Include(a => a.Department)
            .Where(a => a.Status != AssetStatus.Decommissioned)
            .AsQueryable();

        if (departmentId.HasValue)
            query = query.Where(a => a.DepartmentId == departmentId.Value);

        if (assetTypeId.HasValue)
            query = query.Where(a => a.AssetTypeId == assetTypeId.Value);

        if (status.HasValue)
            query = query.Where(a => a.Status == status.Value);

        if (!string.IsNullOrWhiteSpace(severity))
            query = query.Where(a => a.Vulnerabilities.Any(av => av.Vulnerability.Severity != null && av.Vulnerability.Severity.ToLower() == severity.ToLower()));

        if (!string.IsNullOrWhiteSpace(criticality) && Enum.TryParse<AssetCriticality>(criticality, true, out var crit))
            query = query.Where(a => a.Criticality == crit);

        if (!string.IsNullOrWhiteSpace(tag))
        {
            var tagName = tag.Trim().ToLower();
            query = query.Where(a => a.Tags != null && a.Tags.Any(t => t == tagName));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(a => a.Name.ToLower().Contains(term));
        }

        if (hasVulnerabilities.HasValue)
        {
            query = hasVulnerabilities.Value
                ? query.Where(a => a.Vulnerabilities.Any())
                : query.Where(a => !a.Vulnerabilities.Any());
        }

        // Sorting (ThenBy Name tiebreaker keeps pagination stable across pages)
        var descending = sortOrder?.ToLower() != "asc";
        var ordered = sortBy?.ToLower() switch
        {
            "name" => descending ? query.OrderByDescending(a => a.Name) : query.OrderBy(a => a.Name),
            "cvss" => descending ? query.OrderByDescending(a => a.Vulnerabilities.Max(av => (double?)av.Vulnerability.CvssScore)).ThenBy(a => a.Name) : query.OrderBy(a => a.Vulnerabilities.Max(av => (double?)av.Vulnerability.CvssScore)).ThenBy(a => a.Name),
            "vulncount" => descending ? query.OrderByDescending(a => a.Vulnerabilities.Count).ThenBy(a => a.Name) : query.OrderBy(a => a.Vulnerabilities.Count).ThenBy(a => a.Name),
            "criticality" => descending ? query.OrderByDescending(a => a.Criticality).ThenBy(a => a.Name) : query.OrderBy(a => a.Criticality).ThenBy(a => a.Name),
            "lastscanned" => descending ? query.OrderByDescending(a => a.LastScannedAt).ThenBy(a => a.Name) : query.OrderBy(a => a.LastScannedAt).ThenBy(a => a.Name),
            _ => descending ? query.OrderByDescending(a => a.CreatedAt).ThenBy(a => a.Name) : query.OrderBy(a => a.CreatedAt).ThenBy(a => a.Name)
        };

        var result = await ordered
            .Select(a => new AssetResponse
            {
                Id = a.Id,
                Name = a.Name,
                Description = a.Description,
                AssetTypeId = a.AssetTypeId,
                AssetTypeName = a.AssetType.Name,
                DepartmentId = a.DepartmentId,
                DepartmentName = a.Department.Name,
                Status = a.Status,
                Criticality = a.Criticality,
                IsCriticalityAuto = a.IsCriticalityAuto,
                Tags = a.Tags ?? new List<string>(),
                Properties = a.Properties,
                // Computed live from CVE links (the denormalized columns are not reliably maintained)
                HighestCvssScore = a.Vulnerabilities.Max(av => (double?)av.Vulnerability.CvssScore),
                HighestSeverity = a.Vulnerabilities
                    .OrderByDescending(av => av.Vulnerability.CvssScore ?? 0)
                    .Select(av => av.Vulnerability.Severity)
                    .FirstOrDefault(),
                LastScannedAt = a.LastScannedAt,
                VulnerabilityCount = a.Vulnerabilities.Count,
                CreatedAt = a.CreatedAt,
                UpdatedAt = a.UpdatedAt
            })
            .ToPagedResultAsync(page, pageSize);

        // Org-wide stats for the current filter set, as SQL aggregates (not row loads).
        // Clean = filtered asset total minus the ones with at least one CVE.
        var withCves = await query.CountAsync(a => a.Vulnerabilities.Any());
        var totalCves = await query.SumAsync(a => a.Vulnerabilities.Count());

        return Ok(new AssetListResponse
        {
            Items = result.Items,
            TotalCount = result.TotalCount,
            Page = result.Page,
            PageSize = result.PageSize,
            Stats = new AssetListStats
            {
                WithCves = withCves,
                TotalCves = totalCves,
                Clean = result.TotalCount - withCves
            }
        });
    }

    [HttpGet("count")]
    public async Task<IActionResult> GetCount(
        [FromQuery] Guid? departmentId,
        [FromQuery] Guid? assetTypeId,
        [FromQuery] AssetStatus? status,
        [FromQuery] string? severity,
        [FromQuery] string? criticality,
        [FromQuery] string? tag,
        [FromQuery] string? search,
        [FromQuery] bool? hasVulnerabilities)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var query = _db.Assets
            .Where(a => a.Status != AssetStatus.Decommissioned)
            .AsQueryable();

        if (departmentId.HasValue) query = query.Where(a => a.DepartmentId == departmentId.Value);
        if (assetTypeId.HasValue) query = query.Where(a => a.AssetTypeId == assetTypeId.Value);
        if (status.HasValue) query = query.Where(a => a.Status == status.Value);
        if (!string.IsNullOrWhiteSpace(severity)) query = query.Where(a => a.Vulnerabilities.Any(av => av.Vulnerability.Severity != null && av.Vulnerability.Severity.ToLower() == severity.ToLower()));
        if (!string.IsNullOrWhiteSpace(criticality) && Enum.TryParse<AssetCriticality>(criticality, true, out var crit))
            query = query.Where(a => a.Criticality == crit);
        if (!string.IsNullOrWhiteSpace(tag))
        {
            var tagName = tag.Trim().ToLower();
            query = query.Where(a => a.Tags != null && a.Tags.Any(t => t == tagName));
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(a => a.Name.ToLower().Contains(term));
        }
        if (hasVulnerabilities.HasValue)
            query = hasVulnerabilities.Value
                ? query.Where(a => a.Vulnerabilities.Any())
                : query.Where(a => !a.Vulnerabilities.Any());

        var count = await query.CountAsync();
        return Ok(new { count });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var asset = await _db.Assets
            .Include(a => a.AssetType)
            .Include(a => a.Department)
            .Include(a => a.Vulnerabilities)
                .ThenInclude(av => av.Vulnerability)
            .Where(a => a.Id == id && a.Status != AssetStatus.Decommissioned)
            .Select(a => new AssetResponse
            {
                Id = a.Id,
                Name = a.Name,
                Description = a.Description,
                AssetTypeId = a.AssetTypeId,
                AssetTypeName = a.AssetType.Name,
                DepartmentId = a.DepartmentId,
                DepartmentName = a.Department.Name,
                Status = a.Status,
                Criticality = a.Criticality,
                IsCriticalityAuto = a.IsCriticalityAuto,
                Tags = a.Tags ?? new List<string>(),
                Properties = a.Properties,
                // Computed live from CVE links (the denormalized columns are not reliably maintained)
                HighestCvssScore = a.Vulnerabilities.Max(av => (double?)av.Vulnerability.CvssScore),
                HighestSeverity = a.Vulnerabilities
                    .OrderByDescending(av => av.Vulnerability.CvssScore ?? 0)
                    .Select(av => av.Vulnerability.Severity)
                    .FirstOrDefault(),
                LastScannedAt = a.LastScannedAt,
                VulnerabilityCount = a.Vulnerabilities.Count,
                Vulnerabilities = a.Vulnerabilities.Select(av => new VulnerabilityResponse
                {
                    Id = av.VulnerabilityId,
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
                }).ToList(),
                CreatedAt = a.CreatedAt,
                UpdatedAt = a.UpdatedAt
            })
            .FirstOrDefaultAsync();

        if (asset == null) return NotFound();
        return Ok(asset);
    }

    [HttpPatch("{assetId:guid}/vulnerabilities/{vulnerabilityId:guid}/status")]
    public async Task<IActionResult> UpdateVulnerabilityStatus(Guid assetId, Guid vulnerabilityId, [FromBody] UpdateVulnerabilityStatusRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst);
        if (auth != null) return auth;

        var link = await _db.AssetVulnerabilities
            .Include(av => av.Vulnerability)
            .FirstOrDefaultAsync(av => av.AssetId == assetId && av.VulnerabilityId == vulnerabilityId && av.OrganizationId == orgId.Value);

        if (link == null) return NotFound();

        var beforeStatus = link.Status;
        var cveId = link.Vulnerability?.CveId ?? vulnerabilityId.ToString();

        link.Status = request.Status;
        await _db.SaveChangesAsync();

        await _audit.LogAsync("VulnerabilityStatusChanged", "Vulnerability", cveId,
            new { AssetId = assetId, Status = beforeStatus },
            new { AssetId = assetId, Status = request.Status });

        return NoContent();
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAssetRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst);
        if (auth != null) return auth;

        // Validate department belongs to org
        var deptExists = await _db.Departments.AnyAsync(d => d.Id == request.DepartmentId && d.IsActive);
        if (!deptExists)
            return BadRequest(new { message = "Department not found or inactive." });

        // Validate properties against asset type schema
        var (valid, error) = await _validation.ValidateAsync(request.AssetTypeId, orgId.Value, request.Properties);
        if (!valid)
            return BadRequest(new { message = error });

        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Description = request.Description,
            OrganizationId = orgId.Value,
            AssetTypeId = request.AssetTypeId,
            DepartmentId = request.DepartmentId,
            Status = AssetStatus.Active,
            // Respect the caller's choice; IsCriticalityAuto stays true so scans may still adjust it.
            Criticality = request.Criticality,
            IsCriticalityAuto = true,
            Tags = NormalizeTags(request.Tags),
            Properties = request.Properties,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Assets.Add(asset);
        await _db.SaveChangesAsync();

        var assetTypeName = (await _db.AssetTypeDefinitions.FindAsync(asset.AssetTypeId))?.Name;
        await _audit.LogAsync("AssetCreated", "Asset", asset.Id.ToString(),
            null,
            new { asset.Name, Type = assetTypeName });

        return Ok(new AssetResponse
        {
            Id = asset.Id,
            Name = asset.Name,
            Description = asset.Description,
            AssetTypeId = asset.AssetTypeId,
            AssetTypeName = (await _db.AssetTypeDefinitions.FindAsync(asset.AssetTypeId))?.Name ?? "",
            DepartmentId = asset.DepartmentId,
            DepartmentName = (await _db.Departments.FindAsync(asset.DepartmentId))?.Name ?? "",
            Status = asset.Status,
            Criticality = asset.Criticality,
            IsCriticalityAuto = asset.IsCriticalityAuto,
            Tags = asset.Tags ?? new List<string>(),
            Properties = asset.Properties,
            CreatedAt = asset.CreatedAt,
            UpdatedAt = asset.UpdatedAt
        });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAssetRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst);
        if (auth != null) return auth;

        var asset = await _db.Assets
            .FirstOrDefaultAsync(a => a.Id == id && a.Status != AssetStatus.Decommissioned);

        if (asset == null) return NotFound();

        // Validate department belongs to org
        var deptExists = await _db.Departments.AnyAsync(d => d.Id == request.DepartmentId && d.IsActive);
        if (!deptExists)
            return BadRequest(new { message = "Department not found or inactive." });

        // Validate properties against asset type schema
        var (valid, error) = await _validation.ValidateAsync(asset.AssetTypeId, orgId.Value, request.Properties);
        if (!valid)
            return BadRequest(new { message = error });

        var before = new { asset.Name, asset.Status, asset.Criticality, DeptId = asset.DepartmentId };

        asset.Name = request.Name;
        asset.Description = request.Description;
        asset.DepartmentId = request.DepartmentId;
        asset.Status = request.Status;
        asset.Tags = NormalizeTags(request.Tags);

        if (asset.Criticality != request.Criticality)
        {
            asset.Criticality = request.Criticality;
            asset.IsCriticalityAuto = false;
        }

        asset.Properties = request.Properties;
        asset.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var after = new { asset.Name, asset.Status, asset.Criticality, DeptId = asset.DepartmentId };
        await _audit.LogAsync("AssetUpdated", "Asset", asset.Id.ToString(), before, after);

        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst);
        if (auth != null) return auth;

        var asset = await _db.Assets
            .FirstOrDefaultAsync(a => a.Id == id && a.Status != AssetStatus.Decommissioned);

        if (asset == null) return NotFound();

        var before = new { asset.Name, asset.Status };

        asset.Status = AssetStatus.Decommissioned;
        asset.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.LogAsync("AssetDeleted", "Asset", asset.Id.ToString(), before, new { Status = "Decommissioned" });

        return NoContent();
    }

    private static List<string> NormalizeTags(List<string>? tagNames)
    {
        return (tagNames ?? new List<string>())
            .Select(t => t.Trim().ToLower())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Distinct()
            .ToList();
    }
}
