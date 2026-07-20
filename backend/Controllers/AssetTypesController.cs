using backend.Data;
using backend.Infrastructure.Mapping;
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
[Route("api/asset-types")]
[Authorize]
public class AssetTypesController : TenantControllerBase
{
    private readonly IAssetTypeTemplateService _templateService;

    public AssetTypesController(AppDbContext db, UserManager<AppUser> userManager, IAssetTypeTemplateService templateService)
        : base(db, userManager)
    {
        _templateService = templateService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] bool? includeInactive,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortOrder,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        var query = _db.AssetTypeDefinitions
            .Include(at => at.Fields)
            .AsQueryable();

        if (!includeInactive.HasValue || !includeInactive.Value)
            query = query.Where(at => at.IsActive);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(at => at.Name.ToLower().Contains(term));
        }

        var descending = sortOrder?.ToLower() != "asc";
        query = sortBy?.ToLower() switch
        {
            "name" => descending ? query.OrderByDescending(at => at.Name) : query.OrderBy(at => at.Name),
            _ => query.OrderBy(at => at.Name)
        };

        var result = await query
            .Select(at => at.ToResponse())
            .ToPagedResultAsync(page, pageSize);

        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var type = await _db.AssetTypeDefinitions
            .Include(at => at.Fields)
            .Where(at => at.Id == id && at.IsActive)
            .FirstOrDefaultAsync();

        if (type == null) return NotFound();
        return Ok(type.ToResponse());
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAssetTypeRequest request)
    {
        var auth = await RequireOrgAdminAsync();
        if (auth != null) return auth;

        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var assetType = new AssetTypeDefinition
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Description = request.Description,
            IconName = request.IconName,
            OrganizationId = orgId.Value,
            IsActive = true,
            Fields = request.Fields.Select(f => new AssetTypeField
            {
                Id = Guid.NewGuid(),
                Name = f.Name,
                DataType = f.DataType,
                IsRequired = f.IsRequired,
                IsCveSearchable = f.IsCveSearchable,
                DisplayOrder = f.DisplayOrder,
                DefaultValue = f.DefaultValue
            }).ToList()
        };

        _db.AssetTypeDefinitions.Add(assetType);
        await _db.SaveChangesAsync();

        return Ok(assetType.ToResponse());
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAssetTypeRequest request)
    {
        var auth = await RequireOrgAdminAsync();
        if (auth != null) return auth;

        var assetType = await _db.AssetTypeDefinitions
            .Include(at => at.Fields)
            .FirstOrDefaultAsync(at => at.Id == id && at.IsActive);

        if (assetType == null) return NotFound();

        assetType.Name = request.Name;
        assetType.Description = request.Description;
        assetType.IconName = request.IconName;

        // Replace all fields (simple strategy per spec: old assets keep orphan keys)
        _db.AssetTypeFields.RemoveRange(assetType.Fields);
        assetType.Fields = request.Fields.Select(f => new AssetTypeField
        {
            Id = Guid.NewGuid(),
            AssetTypeId = assetType.Id,
            Name = f.Name,
            DataType = f.DataType,
            IsRequired = f.IsRequired,
            IsCveSearchable = f.IsCveSearchable,
            DisplayOrder = f.DisplayOrder,
            DefaultValue = f.DefaultValue
        }).ToList();

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var auth = await RequireOrgAdminAsync();
        if (auth != null) return auth;

        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var assetType = await _db.AssetTypeDefinitions
            .FirstOrDefaultAsync(at => at.Id == id && at.IsActive);

        if (assetType == null) return NotFound();

        var reassignedCount = await _templateService.ReassignAssetsToUnknownTypeAsync(orgId.Value, id);

        assetType.IsActive = false;
        await _db.SaveChangesAsync();

        return Ok(new { message = $"Asset type deleted. {reassignedCount} asset(s) reassigned to 'Unknown'." });
    }
}
