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
            query = query.Where(a => a.HighestSeverity == severity);

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

        // Sorting
        var descending = sortOrder?.ToLower() != "asc";
        query = sortBy?.ToLower() switch
        {
            "name" => descending ? query.OrderByDescending(a => a.Name) : query.OrderBy(a => a.Name),
            "cvss" => descending ? query.OrderByDescending(a => a.HighestCvssScore) : query.OrderBy(a => a.HighestCvssScore),
            "vulncount" => descending ? query.OrderByDescending(a => a.Vulnerabilities.Count) : query.OrderBy(a => a.Vulnerabilities.Count),
            "lastscanned" => descending ? query.OrderByDescending(a => a.LastScannedAt) : query.OrderBy(a => a.LastScannedAt),
            _ => descending ? query.OrderByDescending(a => a.CreatedAt) : query.OrderBy(a => a.CreatedAt)
        };

        var result = await query
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
                Properties = a.Properties,
                HighestCvssScore = a.HighestCvssScore,
                HighestSeverity = a.HighestSeverity,
                LastScannedAt = a.LastScannedAt,
                VulnerabilityCount = a.Vulnerabilities.Count,
                CreatedAt = a.CreatedAt,
                UpdatedAt = a.UpdatedAt
            })
            .ToPagedResultAsync(page, pageSize);

        return Ok(result);
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
                Properties = a.Properties,
                HighestCvssScore = a.HighestCvssScore,
                HighestSeverity = a.HighestSeverity,
                LastScannedAt = a.LastScannedAt,
                VulnerabilityCount = a.Vulnerabilities.Count,
                Vulnerabilities = a.Vulnerabilities.Select(av => new VulnerabilityResponse
                {
                    Id = av.VulnerabilityId,
                    CveId = av.Vulnerability.CveId,
                    Description = av.Vulnerability.Description,
                    CvssScore = av.Vulnerability.CvssScore,
                    Severity = av.Vulnerability.Severity,
                    PublishedDate = av.Vulnerability.PublishedDate,
                    DetectedAt = av.DetectedAt,
                    Status = av.Status,
                    MatchedKeyword = av.MatchedKeyword
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

        var before = new { asset.Name, asset.Status, DeptId = asset.DepartmentId };

        asset.Name = request.Name;
        asset.Description = request.Description;
        asset.DepartmentId = request.DepartmentId;
        asset.Status = request.Status;
        asset.Properties = request.Properties;
        asset.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var after = new { asset.Name, asset.Status, DeptId = asset.DepartmentId };
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
}
