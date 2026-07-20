using backend.Data;
using backend.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

[ApiController]
[Route("api/tags")]
[Authorize]
public class TagsController : TenantControllerBase
{
    public TagsController(AppDbContext db, UserManager<AppUser> userManager) : base(db, userManager)
    {
    }

    [HttpGet]
    public async Task<IActionResult> GetTags()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var tags = await _db.Assets
            .Where(a => a.OrganizationId == orgId.Value && a.Tags != null && a.Tags.Any())
            .SelectMany(a => a.Tags!)
            .Distinct()
            .OrderBy(t => t)
            .Select(name => new { id = name, name })
            .ToListAsync();

        return Ok(tags);
    }
}
