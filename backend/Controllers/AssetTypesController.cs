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
public class AssetTypesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _userManager;

    public AssetTypesController(AppDbContext db, UserManager<AppUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    private async Task<Guid> GetCurrentOrgIdAsync()
    {
        var user = await _userManager.GetUserAsync(User);
        return user?.OrganizationId ?? Guid.Empty;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var orgId = await GetCurrentOrgIdAsync();
        _db.CurrentOrganizationId = orgId;

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
        _db.CurrentOrganizationId = orgId;

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

    [Authorize(Roles = RoleNames.Admin)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAssetTypeRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();

        var assetType = new AssetTypeDefinition
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Description = request.Description,
            IconName = request.IconName,
            OrganizationId = orgId,
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

    [Authorize(Roles = RoleNames.Admin)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAssetTypeRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();
        _db.CurrentOrganizationId = orgId;

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

    [Authorize(Roles = RoleNames.Admin)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        _db.CurrentOrganizationId = orgId;

        var assetType = await _db.AssetTypeDefinitions
            .FirstOrDefaultAsync(at => at.Id == id && at.IsActive);

        if (assetType == null) return NotFound();

        assetType.IsActive = false;
        await _db.SaveChangesAsync();

        return NoContent();
    }
}
