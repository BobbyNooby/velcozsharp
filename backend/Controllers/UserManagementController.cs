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
[Route("api/users")]
[Authorize]
public class UserManagementController : TenantControllerBase
{
    public UserManagementController(AppDbContext db, UserManager<AppUser> userManager)
        : base(db, userManager)
    {
    }

    [HttpGet]
    public async Task<IActionResult> GetUsers()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var users = await _db.UserOrganizations
            .Where(uo => uo.OrganizationId == orgId.Value)
            .Include(uo => uo.User)
            .Select(uo => new
            {
                uo.UserId,
                uo.User.Email,
                uo.User.DisplayName,
                uo.Role,
                uo.IsDefault
            })
            .ToListAsync();

        return Ok(users);
    }

    [HttpPost("invite")]
    public async Task<IActionResult> Invite([FromBody] InviteUserRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var auth = await RequireOrgAdminAsync();
        if (auth != null) return auth;

        if (!new[] { RoleNames.Admin, RoleNames.SecurityAnalyst, RoleNames.Viewer }.Contains(request.Role))
            return BadRequest(new { message = "Invalid role" });

        var existingMembership = await _db.UserOrganizations
            .FirstOrDefaultAsync(uo => uo.OrganizationId == orgId.Value && uo.User.Email == request.Email);

        if (existingMembership != null)
            return BadRequest(new { message = "User is already a member of this organization" });

        var user = await _userManager.FindByEmailAsync(request.Email);
        var isNewUser = user == null;

        if (user == null)
        {
            user = new AppUser
            {
                Id = Guid.NewGuid(),
                UserName = request.Email,
                Email = request.Email,
                DisplayName = request.Email.Split('@')[0],
                EmailConfirmed = true
            };

            // Generate a random temporary password
            var tempPassword = Guid.NewGuid().ToString("N")[..12] + "A1!";
            var createResult = await _userManager.CreateAsync(user, tempPassword);
            if (!createResult.Succeeded)
                return BadRequest(new { message = string.Join(", ", createResult.Errors.Select(e => e.Description)) });

            await _userManager.AddToRoleAsync(user, request.Role);
        }
        else
        {
            // Ensure the global role exists at least at the invited level
            var currentRoles = await _userManager.GetRolesAsync(user);
            if (!currentRoles.Contains(request.Role))
            {
                await _userManager.AddToRoleAsync(user, request.Role);
            }
        }

        _db.UserOrganizations.Add(new UserOrganization
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            OrganizationId = orgId.Value,
            Role = request.Role,
            IsDefault = false
        });

        await _db.SaveChangesAsync();

        return Ok(new
        {
            userId = user.Id,
            email = user.Email,
            displayName = user.DisplayName,
            role = request.Role,
            isNewUser,
            message = isNewUser
                ? "User invited and temporary account created. They should change their password on first login."
                : "User invited to organization."
        });
    }

    [HttpPatch("{userId:guid}/role")]
    public async Task<IActionResult> UpdateRole(Guid userId, [FromBody] UpdateUserRoleRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var auth = await RequireOrgAdminAsync();
        if (auth != null) return auth;

        if (!new[] { RoleNames.Admin, RoleNames.SecurityAnalyst, RoleNames.Viewer }.Contains(request.Role))
            return BadRequest(new { message = "Invalid role" });

        var membership = await _db.UserOrganizations
            .FirstOrDefaultAsync(uo => uo.OrganizationId == orgId.Value && uo.UserId == userId);

        if (membership == null)
            return NotFound(new { message = "User is not a member of this organization" });

        membership.Role = request.Role;
        await _db.SaveChangesAsync();

        // Sync global Identity role for simple scenarios
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user != null)
        {
            var roles = await _userManager.GetRolesAsync(user);
            if (!roles.Contains(request.Role))
            {
                await _userManager.RemoveFromRolesAsync(user, roles);
                await _userManager.AddToRoleAsync(user, request.Role);
            }
        }

        return NoContent();
    }

    [HttpDelete("{userId:guid}")]
    public async Task<IActionResult> RemoveUser(Guid userId)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var auth = await RequireOrgAdminAsync();
        if (auth != null) return auth;

        var currentUser = await _userManager.GetUserAsync(User);
        if (currentUser != null && currentUser.Id == userId)
            return BadRequest(new { message = "You cannot remove yourself" });

        var membership = await _db.UserOrganizations
            .FirstOrDefaultAsync(uo => uo.OrganizationId == orgId.Value && uo.UserId == userId);

        if (membership == null)
            return NotFound(new { message = "User is not a member of this organization" });

        _db.UserOrganizations.Remove(membership);
        await _db.SaveChangesAsync();

        return NoContent();
    }
}
