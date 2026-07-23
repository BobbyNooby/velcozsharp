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
    /// Reads X-Organization-Id header, validates user is a member of that org (or is a platform admin),
    /// sets _db.CurrentOrganizationId, and returns the org ID.
    /// Returns null if header is missing or user is not authorized.
    /// </summary>
    protected async Task<Guid?> GetCurrentOrgIdAsync()
    {
        var headerValue = Request.Headers["X-Organization-Id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(headerValue) || !Guid.TryParse(headerValue, out var orgId))
            return null;

        var user = await _userManager.GetUserAsync(User);
        if (user == null) return null;

        // Platform admins can access any organization.
        if (await IsPlatformAdminAsync(user))
        {
            _db.CurrentOrganizationId = orgId;
            return orgId;
        }

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
    /// Returns "Admin" for platform admins even if they are not a member.
    /// </summary>
    protected async Task<string?> GetUserOrgRoleAsync(Guid orgId)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return null;

        if (await IsPlatformAdminAsync(user))
            return RoleNames.Admin;

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

    /// <summary>
    /// Ensures the current user has one of the allowed roles in the current organization.
    /// Returns a Forbid result if not authorized, or null if authorized.
    /// </summary>
    protected async Task<IActionResult?> RequireOrgRoleAsync(params string[] allowedRoles)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var role = await GetUserOrgRoleAsync(orgId.Value);
        if (role == null || !allowedRoles.Contains(role))
            return Forbid();

        return null;
    }

    private async Task<bool> IsPlatformAdminAsync(AppUser user)
    {
        return await _userManager.IsInRoleAsync(user, RoleNames.PlatformAdmin);
    }
}
