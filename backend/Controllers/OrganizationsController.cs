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
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] bool? activeOnly,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortOrder,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Unauthorized();

        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        var query = _db.UserOrganizations
            .Where(uo => uo.UserId == user.Id)
            .Include(uo => uo.Organization)
            .Select(uo => uo.Organization)
            .AsQueryable();

        if (!activeOnly.HasValue || activeOnly.Value)
            query = query.Where(o => o.IsActive);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(o => o.Name.ToLower().Contains(term));
        }

        var descending = sortOrder?.ToLower() != "asc";
        query = sortBy?.ToLower() switch
        {
            "name" => descending ? query.OrderByDescending(o => o.Name) : query.OrderBy(o => o.Name),
            "created" => descending ? query.OrderByDescending(o => o.CreatedAt) : query.OrderBy(o => o.CreatedAt),
            _ => query.OrderBy(o => o.Name)
        };

        var result = await query
            .Select(o => new OrganizationResponse
            {
                Id = o.Id,
                Name = o.Name,
                Description = o.Description,
                IsActive = o.IsActive,
                CreatedAt = o.CreatedAt
            })
            .ToPagedResultAsync(page, pageSize);

        return Ok(result);
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

        var reassignedCount = await _templateService.ReassignAssetsToUnknownTypeAsync(id);

        org.IsActive = false;
        await _db.SaveChangesAsync();

        return Ok(new { message = $"Organization deleted. {reassignedCount} asset(s) reassigned to 'Unknown'." });
    }
}
