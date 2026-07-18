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
[Route("api/asset-types")]
[Authorize]
public class AssetTypesController : TenantControllerBase
{
    public AssetTypesController(AppDbContext db, UserManager<AppUser> userManager)
        : base(db, userManager)
    {
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var types = await _db.AssetTypeDefinitions
            .Include(at => at.Fields)
            .Where(at => at.IsActive)
            .OrderBy(at => at.Name)
            .Select(at => new AssetTypeResponse
            {
                Id = at.Id,
                Name = at.Name,
                Description = at.Description,
                IconName = at.IconName,
                IsActive = at.IsActive,
                Fields = at.Fields
                    .OrderBy(f => f.DisplayOrder)
                    .Select(f => new AssetTypeFieldResponse
                    {
                        Id = f.Id,
                        Name = f.Name,
                        DataType = f.DataType,
                        IsRequired = f.IsRequired,
                        IsCveSearchable = f.IsCveSearchable,
                        DisplayOrder = f.DisplayOrder,
                        DefaultValue = f.DefaultValue
                    })
                    .ToList()
            })
            .ToListAsync();

        return Ok(types);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var type = await _db.AssetTypeDefinitions
            .Include(at => at.Fields)
            .Where(at => at.Id == id && at.IsActive)
            .Select(at => new AssetTypeResponse
            {
                Id = at.Id,
                Name = at.Name,
                Description = at.Description,
                IconName = at.IconName,
                IsActive = at.IsActive,
                Fields = at.Fields
                    .OrderBy(f => f.DisplayOrder)
                    .Select(f => new AssetTypeFieldResponse
                    {
                        Id = f.Id,
                        Name = f.Name,
                        DataType = f.DataType,
                        IsRequired = f.IsRequired,
                        IsCveSearchable = f.IsCveSearchable,
                        DisplayOrder = f.DisplayOrder,
                        DefaultValue = f.DefaultValue
                    })
                    .ToList()
            })
            .FirstOrDefaultAsync();

        if (type == null) return NotFound();
        return Ok(type);
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

        return Ok(new AssetTypeResponse
        {
            Id = assetType.Id,
            Name = assetType.Name,
            Description = assetType.Description,
            IconName = assetType.IconName,
            IsActive = assetType.IsActive,
            Fields = assetType.Fields
                .OrderBy(f => f.DisplayOrder)
                .Select(f => new AssetTypeFieldResponse
                {
                    Id = f.Id,
                    Name = f.Name,
                    DataType = f.DataType,
                    IsRequired = f.IsRequired,
                    IsCveSearchable = f.IsCveSearchable,
                    DisplayOrder = f.DisplayOrder,
                    DefaultValue = f.DefaultValue
                })
                .ToList()
        });
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

        // Find or create a fallback "Unknown" type so assets don't break
        var unknownType = await _db.AssetTypeDefinitions
            .FirstOrDefaultAsync(at => at.Name == "Unknown" && at.OrganizationId == orgId.Value && at.IsActive);

        if (unknownType == null)
        {
            unknownType = new AssetTypeDefinition
            {
                Id = Guid.NewGuid(),
                Name = "Unknown",
                Description = "Fallback type for assets whose original type was deleted.",
                OrganizationId = orgId.Value,
                IsActive = true,
                Fields = []
            };
            _db.AssetTypeDefinitions.Add(unknownType);
            await _db.SaveChangesAsync();
        }

        // Reassign all assets using this type to Unknown
        var affectedAssets = await _db.Assets
            .Where(a => a.AssetTypeId == id)
            .ToListAsync();

        foreach (var asset in affectedAssets)
        {
            asset.AssetTypeId = unknownType.Id;
        }

        assetType.IsActive = false;
        await _db.SaveChangesAsync();

        return Ok(new { message = $"Asset type deleted. {affectedAssets.Count} asset(s) reassigned to 'Unknown'." });
    }
}
