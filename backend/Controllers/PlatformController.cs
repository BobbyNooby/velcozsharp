using backend.Data;
using backend.Infrastructure.Pagination;
using backend.Models.Dtos;
using backend.Models.Entities;
using backend.Models.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text.Json;

namespace backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = RoleNames.PlatformAdmin)]
public class PlatformController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _userManager;
    private static readonly JsonSerializerOptions AuditJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public PlatformController(AppDbContext db, UserManager<AppUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    /// <summary>
    /// Writes an audit record attributed to a specific organization. Unlike IAuditLogService
    /// (which resolves the org from the X-Organization-Id header and drops records when absent),
    /// platform actions must be attributed to the affected org, so rows are written directly.
    /// </summary>
    private async Task LogOrgAuditAsync(Guid organizationId, string action, string entityType, string entityId, object? before = null, object? after = null)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            BeforeJson = before == null ? null : JsonSerializer.Serialize(before, AuditJsonOptions),
            AfterJson = after == null ? null : JsonSerializer.Serialize(after, AuditJsonOptions),
            ChangedByUserId = _userManager.GetUserId(User),
            Timestamp = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Logs a platform action on a user into the audit log of every organization the user belongs to.
    /// </summary>
    private async Task LogUserAuditAsync(AppUser user, string action, object? before = null, object? after = null)
    {
        var orgIds = await _db.UserOrganizations
            .IgnoreQueryFilters()
            .Where(uo => uo.UserId == user.Id)
            .Select(uo => uo.OrganizationId)
            .ToListAsync();

        foreach (var orgId in orgIds)
        {
            _db.AuditLogs.Add(new AuditLog
            {
                Id = Guid.NewGuid(),
                OrganizationId = orgId,
                Action = action,
                EntityType = "User",
                EntityId = user.Id.ToString(),
                BeforeJson = before == null ? null : JsonSerializer.Serialize(before, AuditJsonOptions),
                AfterJson = after == null ? null : JsonSerializer.Serialize(after, AuditJsonOptions),
                ChangedByUserId = _userManager.GetUserId(User),
                Timestamp = DateTime.UtcNow
            });
        }

        if (orgIds.Count > 0)
            await _db.SaveChangesAsync();
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var orgCount = await _db.Organizations.CountAsync();
        var userCount = await _db.Users.CountAsync();
        var assetCount = await _db.Assets.CountAsync();
        var vulnCount = await _db.AssetVulnerabilities.CountAsync();
        var activeJobs = await _db.ScanJobs.CountAsync(j => j.Status == ScanJobStatus.Running || j.Status == ScanJobStatus.Queued);

        bool dbHealthy;
        try
        {
            await _db.Database.ExecuteSqlRawAsync("SELECT 1");
            dbHealthy = true;
        }
        catch
        {
            dbHealthy = false;
        }

        return Ok(new PlatformStatsResponse
        {
            OrganizationCount = orgCount,
            UserCount = userCount,
            TotalAssetCount = assetCount,
            TotalVulnerabilityCount = vulnCount,
            ActiveScanJobCount = activeJobs,
            DatabaseHealthy = dbHealthy
        });
    }

    [HttpGet("organizations")]
    public async Task<IActionResult> GetOrganizations(
        [FromQuery] string? search,
        [FromQuery] bool? isActive,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortOrder,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        var query = _db.Organizations.AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(o => o.Name.ToLower().Contains(term) ||
                (o.Description != null && o.Description.ToLower().Contains(term)));
        }

        if (isActive.HasValue)
            query = query.Where(o => o.IsActive == isActive.Value);

        var descending = sortOrder?.ToLower() != "asc";
        query = sortBy?.ToLower() switch
        {
            "name" => descending ? query.OrderByDescending(o => o.Name) : query.OrderBy(o => o.Name),
            "created" => descending ? query.OrderByDescending(o => o.CreatedAt) : query.OrderBy(o => o.CreatedAt),
            _ => descending ? query.OrderByDescending(o => o.CreatedAt) : query.OrderBy(o => o.CreatedAt)
        };

        var result = await query
            .Select(o => new PlatformOrganizationResponse
            {
                Id = o.Id,
                Name = o.Name,
                Description = o.Description,
                IsActive = o.IsActive,
                CreatedAt = o.CreatedAt,
                UserCount = o.UserOrganizations.Count,
                AssetCount = o.Assets.Count
            })
            .ToPagedResultAsync(page, pageSize);

        return Ok(result);
    }

    [HttpPatch("organizations/{id:guid}")]
    public async Task<IActionResult> UpdateOrganization(Guid id, [FromBody] UpdateOrganizationActiveRequest request)
    {
        var org = await _db.Organizations.FindAsync(id);
        if (org == null) return NotFound();

        var before = new { org.Name, org.IsActive };

        org.IsActive = request.IsActive;
        await _db.SaveChangesAsync();

        await LogOrgAuditAsync(org.Id,
            request.IsActive ? "PlatformOrganizationActivated" : "PlatformOrganizationSuspended",
            "Organization", org.Id.ToString(),
            before,
            new { org.Name, org.IsActive });

        return NoContent();
    }

    [HttpDelete("organizations/{id:guid}")]
    public async Task<IActionResult> DeleteOrganization(Guid id)
    {
        var org = await _db.Organizations
            .Include(o => o.Assets)
            .Include(o => o.UserOrganizations)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (org == null) return NotFound();

        var before = new { org.Name, org.IsActive, MemberCount = org.UserOrganizations.Count };

        // Soft delete: mark inactive and remove memberships so users can't access it
        org.IsActive = false;
        _db.UserOrganizations.RemoveRange(org.UserOrganizations);
        await _db.SaveChangesAsync();

        await LogOrgAuditAsync(org.Id, "PlatformOrganizationDeleted", "Organization", org.Id.ToString(),
            before,
            new { IsActive = false, MembersRemoved = before.MemberCount });

        return NoContent();
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers(
        [FromQuery] string? search,
        [FromQuery] Guid? organizationId,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortOrder,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        var query = _db.Users.AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(u =>
                (u.Email != null && u.Email.ToLower().Contains(term)) ||
                (u.DisplayName != null && u.DisplayName.ToLower().Contains(term)));
        }

        if (organizationId.HasValue)
        {
            query = query.Where(u => u.UserOrganizations.Any(uo => uo.OrganizationId == organizationId.Value));
        }

        var descending = sortOrder?.ToLower() != "asc";
        query = sortBy?.ToLower() switch
        {
            "email" => descending ? query.OrderByDescending(u => u.Email) : query.OrderBy(u => u.Email),
            "name" => descending ? query.OrderByDescending(u => u.DisplayName) : query.OrderBy(u => u.DisplayName),
            _ => descending ? query.OrderByDescending(u => u.CreatedAt) : query.OrderBy(u => u.CreatedAt)
        };

        var userIds = await query.Select(u => u.Id).ToListAsync();

        var users = await query
            .Select(u => new PlatformUserResponse
            {
                Id = u.Id,
                Email = u.Email ?? "",
                DisplayName = u.DisplayName,
                CreatedAt = u.CreatedAt,
                IsLockedOut = u.LockoutEnd != null && u.LockoutEnd > DateTimeOffset.UtcNow
            })
            .ToPagedResultAsync(page, pageSize);

        var membershipsByUserId = await _db.UserOrganizations
            .Where(uo => userIds.Contains(uo.UserId))
            .Include(uo => uo.Organization)
            .ToListAsync();

        var membershipMap = membershipsByUserId
            .GroupBy(uo => uo.UserId)
            .ToDictionary(
                g => g.Key,
                g => g.Select(uo => new PlatformUserOrganizationMembership
                {
                    OrganizationId = uo.OrganizationId,
                    OrganizationName = uo.Organization.Name,
                    Role = uo.Role
                }).ToList());

        foreach (var user in users.Items)
        {
            user.Organizations = membershipMap.TryGetValue(user.Id, out var orgs) ? orgs : [];
        }

        return Ok(users);
    }

    [HttpPost("users/{userId:guid}/reset-password")]
    public async Task<IActionResult> ResetUserPassword(Guid userId)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null) return NotFound();

        // Prevent resetting platform admin passwords from this endpoint to avoid lockouts
        var roles = await _userManager.GetRolesAsync(user);
        if (roles.Contains(RoleNames.PlatformAdmin))
            return BadRequest(new { message = "Reset another platform admin's password manually via the database." });

        var newPassword = GenerateRandomPassword();

        var removeResult = await _userManager.RemovePasswordAsync(user);
        if (!removeResult.Succeeded)
            return BadRequest(new { message = string.Join(", ", removeResult.Errors.Select(e => e.Description)) });

        var addResult = await _userManager.AddPasswordAsync(user, newPassword);
        if (!addResult.Succeeded)
            return BadRequest(new { message = string.Join(", ", addResult.Errors.Select(e => e.Description)) });

        await LogUserAuditAsync(user, "PlatformUserPasswordReset");

        return Ok(new ResetUserPasswordResponse { NewPassword = newPassword });
    }

    [HttpPost("users/{userId:guid}/set-password")]
    public async Task<IActionResult> SetUserPassword(Guid userId, [FromBody] SetUserPasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 6)
            return BadRequest(new { message = "New password must be at least 6 characters" });

        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null) return NotFound();

        var roles = await _userManager.GetRolesAsync(user);
        if (roles.Contains(RoleNames.PlatformAdmin))
            return BadRequest(new { message = "Set another platform admin's password manually via the database." });

        var removeResult = await _userManager.RemovePasswordAsync(user);
        if (!removeResult.Succeeded)
            return BadRequest(new { message = string.Join(", ", removeResult.Errors.Select(e => e.Description)) });

        var addResult = await _userManager.AddPasswordAsync(user, request.NewPassword);
        if (!addResult.Succeeded)
            return BadRequest(new { message = string.Join(", ", addResult.Errors.Select(e => e.Description)) });

        await LogUserAuditAsync(user, "PlatformUserPasswordSet");

        return Ok(new { message = "Password set successfully" });
    }

    [HttpPost("users/{userId:guid}/lock")]
    public async Task<IActionResult> LockUser(Guid userId)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null) return NotFound();

        var wasLockedOut = user.LockoutEnd != null && user.LockoutEnd > DateTimeOffset.UtcNow;

        await _userManager.SetLockoutEndDateAsync(user, DateTimeOffset.UtcNow.AddYears(100));

        await LogUserAuditAsync(user, "PlatformUserLocked",
            new { user.Email, IsLockedOut = wasLockedOut },
            new { user.Email, IsLockedOut = true });

        return NoContent();
    }

    [HttpPost("users/{userId:guid}/unlock")]
    public async Task<IActionResult> UnlockUser(Guid userId)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null) return NotFound();

        var wasLockedOut = user.LockoutEnd != null && user.LockoutEnd > DateTimeOffset.UtcNow;

        await _userManager.SetLockoutEndDateAsync(user, null);
        await _userManager.ResetAccessFailedCountAsync(user);

        await LogUserAuditAsync(user, "PlatformUserUnlocked",
            new { user.Email, IsLockedOut = wasLockedOut },
            new { user.Email, IsLockedOut = false });

        return NoContent();
    }

    private static string GenerateRandomPassword(int length = 16)
    {
        const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
        return new string(Enumerable.Range(0, length)
            .Select(_ => chars[RandomNumberGenerator.GetInt32(chars.Length)])
            .ToArray());
    }
}
