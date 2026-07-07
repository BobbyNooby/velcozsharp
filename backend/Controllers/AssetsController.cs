using backend.Data;
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
public class AssetsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _userManager;
    private readonly IAssetValidationService _validation;

    public AssetsController(AppDbContext db, UserManager<AppUser> userManager, IAssetValidationService validation)
    {
        _db = db;
        _userManager = userManager;
        _validation = validation;
    }

    private async Task<Guid> GetCurrentOrgIdAsync()
    {
        var user = await _userManager.GetUserAsync(User);
        return user?.OrganizationId ?? Guid.Empty;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? departmentId,
        [FromQuery] Guid? assetTypeId,
        [FromQuery] AssetStatus? status,
        [FromQuery] string? severity)
    {
        var orgId = await GetCurrentOrgIdAsync();
        _db.CurrentOrganizationId = orgId;

        var query = _db.Assets
            .Include(a => a.AssetType)
            .Include(a => a.Department)
            .Include(a => a.Vulnerabilities)
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

        var assets = await query
            .OrderByDescending(a => a.CreatedAt)
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
            .ToListAsync();

        return Ok(assets);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        _db.CurrentOrganizationId = orgId;

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
                CreatedAt = a.CreatedAt,
                UpdatedAt = a.UpdatedAt
            })
            .FirstOrDefaultAsync();

        if (asset == null) return NotFound();
        return Ok(asset);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAssetRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();

        // Validate department belongs to org
        _db.CurrentOrganizationId = orgId;
        var deptExists = await _db.Departments.AnyAsync(d => d.Id == request.DepartmentId && d.IsActive);
        if (!deptExists)
            return BadRequest(new { message = "Department not found or inactive." });

        // Validate properties against asset type schema
        var (valid, error) = await _validation.ValidateAsync(request.AssetTypeId, orgId, request.Properties);
        if (!valid)
            return BadRequest(new { message = error });

        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Description = request.Description,
            OrganizationId = orgId,
            AssetTypeId = request.AssetTypeId,
            DepartmentId = request.DepartmentId,
            Status = AssetStatus.Active,
            Properties = request.Properties,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Assets.Add(asset);
        await _db.SaveChangesAsync();

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
        _db.CurrentOrganizationId = orgId;

        var asset = await _db.Assets
            .FirstOrDefaultAsync(a => a.Id == id && a.Status != AssetStatus.Decommissioned);

        if (asset == null) return NotFound();

        // Validate department belongs to org
        var deptExists = await _db.Departments.AnyAsync(d => d.Id == request.DepartmentId && d.IsActive);
        if (!deptExists)
            return BadRequest(new { message = "Department not found or inactive." });

        // Validate properties against asset type schema
        var (valid, error) = await _validation.ValidateAsync(asset.AssetTypeId, orgId, request.Properties);
        if (!valid)
            return BadRequest(new { message = error });

        asset.Name = request.Name;
        asset.Description = request.Description;
        asset.DepartmentId = request.DepartmentId;
        asset.Status = request.Status;
        asset.Properties = request.Properties;
        asset.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        _db.CurrentOrganizationId = orgId;

        var asset = await _db.Assets
            .FirstOrDefaultAsync(a => a.Id == id && a.Status != AssetStatus.Decommissioned);

        if (asset == null) return NotFound();

        asset.Status = AssetStatus.Decommissioned;
        asset.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return NoContent();
    }
}
