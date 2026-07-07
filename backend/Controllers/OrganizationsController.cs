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
[Route("api/[controller]")]
[Authorize]
public class OrganizationsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _userManager;

    public OrganizationsController(AppDbContext db, UserManager<AppUser> userManager)
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

        // Return only the current user's org
        var orgs = await _db.Organizations
            .Where(o => o.Id == orgId)
            .Select(o => new OrganizationResponse
            {
                Id = o.Id,
                Name = o.Name,
                Description = o.Description,
                IsActive = o.IsActive,
                CreatedAt = o.CreatedAt
            })
            .ToListAsync();

        return Ok(orgs);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (id != orgId) return NotFound();

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
        await _db.SaveChangesAsync();

        return Ok(new OrganizationResponse
        {
            Id = org.Id,
            Name = org.Name,
            Description = org.Description,
            IsActive = org.IsActive,
            CreatedAt = org.CreatedAt
        });
    }

    [Authorize(Roles = RoleNames.Admin)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateOrganizationRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (id != orgId) return NotFound();

        var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Id == id);
        if (org == null) return NotFound();

        org.Name = request.Name;
        org.Description = request.Description;
        org.NvdApiKey = request.NvdApiKey;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Roles = RoleNames.Admin)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (id != orgId) return NotFound();

        var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Id == id);
        if (org == null) return NotFound();

        org.IsActive = false;
        await _db.SaveChangesAsync();

        return NoContent();
    }
}
