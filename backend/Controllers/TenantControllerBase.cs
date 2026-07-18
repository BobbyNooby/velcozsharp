using backend.Data;
using backend.Models.Entities;
using backend.Models.Enums;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

public abstract class TenantControllerBase : ControllerBase
{
    protected readonly AppDbContext _db;
    protected readonly UserManager<AppUser> _userManager;

    protected TenantControllerBase(AppDbContext db, UserManager<AppUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    /// <summary>
    /// Reads X-Organization-Id header, validates user is a member of that org,
    /// sets _db.CurrentOrganizationId, and returns the org ID.
    /// Returns null if header is missing or user is not a member.
    /// </summary>
    protected async Task<Guid?> GetCurrentOrgIdAsync()
    {
        var headerValue = Request.Headers["X-Organization-Id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(headerValue) || !Guid.TryParse(headerValue, out var orgId))
            return null;

        var user = await _userManager.GetUserAsync(User);
        if (user == null) return null;

        // Validate membership via UserOrganization join table
        var isMember = await _db.UserOrganizations
            .AnyAsync(uo => uo.UserId == user.Id && uo.OrganizationId == orgId);

        if (!isMember)
            return null;

        _db.CurrentOrganizationId = orgId;
        return orgId;
    }

    /// <summary>
    /// Gets the user's role within the specified organization.
    /// </summary>
    protected async Task<string?> GetUserOrgRoleAsync(Guid orgId)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return null;

        return await _db.UserOrganizations
            .Where(uo => uo.UserId == user.Id && uo.OrganizationId == orgId)
            .Select(uo => uo.Role)
            .FirstOrDefaultAsync();
    }

    /// <summary>
    /// Ensures the current user is an admin of the current organization.
    /// Returns a Forbid result if not authorized, or null if authorized.
    /// </summary>
    protected async Task<IActionResult?> RequireOrgAdminAsync()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var role = await GetUserOrgRoleAsync(orgId.Value);
        if (role != RoleNames.Admin)
            return Forbid();

        return null;
    }
}
