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
[Route("api/[controller]")]
[Authorize]
public class OrganizationsController : TenantControllerBase
{
    private readonly IAssetTypeTemplateService _templateService;

    public OrganizationsController(AppDbContext db, UserManager<AppUser> userManager, IAssetTypeTemplateService templateService)
        : base(db, userManager)
    {
        _templateService = templateService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Unauthorized();

        // Return all orgs the user is a member of
        var orgs = await _db.UserOrganizations
            .Where(uo => uo.UserId == user.Id)
            .Include(uo => uo.Organization)
            .Select(uo => new OrganizationResponse
            {
                Id = uo.Organization.Id,
                Name = uo.Organization.Name,
                Description = uo.Organization.Description,
                IsActive = uo.Organization.IsActive,
                CreatedAt = uo.Organization.CreatedAt
            })
            .ToListAsync();

        return Ok(orgs);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Unauthorized();

        // Verify membership
        var isMember = await _db.UserOrganizations
            .AnyAsync(uo => uo.UserId == user.Id && uo.OrganizationId == id);
        if (!isMember) return NotFound();

        var org = await _db.Organizations
            .Where(o => o.Id == id)
            .Select(o => new OrganizationResponse
            {
                Id = o.Id,
                Name = o.Name,
                Description = o.Description,
                IsActive = o.IsActive,
                CreatedAt = o.CreatedAt
            })
            .FirstOrDefaultAsync();

        if (org == null) return NotFound();
        return Ok(org);
    }

    [Authorize(Roles = RoleNames.Admin)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateOrganizationRequest request)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Unauthorized();

        var org = new Organization
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Description = request.Description,
            NvdApiKey = request.NvdApiKey,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.Organizations.Add(org);

        // Auto-add creator as Admin member
        var membership = new UserOrganization
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            OrganizationId = org.Id,
            Role = RoleNames.Admin,
            IsDefault = true
        };
        _db.UserOrganizations.Add(membership);

        await _db.SaveChangesAsync();

        // Seed built-in asset type templates for the new org
        await _templateService.SeedBuiltInTypesAsync(org.Id);

        return Ok(new OrganizationResponse
        {
            Id = org.Id,
            Name = org.Name,
            Description = org.Description,
            IsActive = org.IsActive,
            CreatedAt = org.CreatedAt
        });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateOrganizationRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (orgId != id) return NotFound();

        var auth = await RequireOrgAdminAsync();
        if (auth != null) return auth;

        var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Id == id);
        if (org == null) return NotFound();

        org.Name = request.Name;
        org.Description = request.Description;
        org.NvdApiKey = request.NvdApiKey;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (orgId != id) return NotFound();

        var auth = await RequireOrgAdminAsync();
        if (auth != null) return auth;

        var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Id == id);
        if (org == null) return NotFound();

        // Reassign assets to Unknown type
        var unknownType = await _db.AssetTypeDefinitions
            .FirstOrDefaultAsync(at => at.Name == "Unknown" && at.OrganizationId == id && at.IsActive);

        if (unknownType == null)
        {
            unknownType = new AssetTypeDefinition
            {
                Id = Guid.NewGuid(),
                Name = "Unknown",
                Description = "Fallback type for assets whose original type was deleted.",
                OrganizationId = id,
                IsActive = true,
                Fields = []
            };
            _db.AssetTypeDefinitions.Add(unknownType);
            await _db.SaveChangesAsync();
        }

        var affectedAssets = await _db.Assets
            .Where(a => a.OrganizationId == id)
            .ToListAsync();

        foreach (var asset in affectedAssets)
        {
            asset.AssetTypeId = unknownType.Id;
        }

        org.IsActive = false;
        await _db.SaveChangesAsync();

        return Ok(new { message = $"Organization deleted. {affectedAssets.Count} asset(s) reassigned to 'Unknown'." });
    }
}
