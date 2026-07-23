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
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _userManager;
    private readonly SignInManager<AppUser> _signInManager;
    private readonly IAssetTypeTemplateService _templateService;

    public AuthController(AppDbContext db, UserManager<AppUser> userManager, SignInManager<AppUser> signInManager, IAssetTypeTemplateService templateService)
    {
        _db = db;
        _userManager = userManager;
        _signInManager = signInManager;
        _templateService = templateService;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Email and password are required" });

        var existingUser = await _userManager.FindByEmailAsync(request.Email);
        if (existingUser != null)
            return BadRequest(new { message = "An account with this email already exists" });

        var displayName = string.IsNullOrWhiteSpace(request.DisplayName)
            ? request.Email.Split('@')[0]
            : request.DisplayName;

        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            UserName = request.Email,
            Email = request.Email,
            DisplayName = displayName,
            EmailConfirmed = true
        };

        var createResult = await _userManager.CreateAsync(user, request.Password);
        if (!createResult.Succeeded)
            return BadRequest(new { message = string.Join(", ", createResult.Errors.Select(e => e.Description)) });

        // First user to register becomes the platform admin.
        var isFirstUser = !await _db.Users.AnyAsync(u => u.Id != user.Id);
        var assignedRole = isFirstUser ? RoleNames.PlatformAdmin : RoleNames.Admin;
        await _userManager.AddToRoleAsync(user, assignedRole);

        // Create a personal organization for the new user
        var org = new Organization
        {
            Id = Guid.NewGuid(),
            Name = $"{displayName}'s Organization",
            Description = "",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _db.Organizations.Add(org);

        _db.UserOrganizations.Add(new UserOrganization
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            OrganizationId = org.Id,
            Role = RoleNames.Admin,
            IsDefault = true
        });

        await _db.SaveChangesAsync();
        await _templateService.SeedBuiltInTypesAsync(org.Id);

        await _signInManager.SignInAsync(user, isPersistent: true);

        return Ok(new
        {
            userId = user.Id,
            email = user.Email,
            displayName = user.DisplayName,
            role = assignedRole,
            isPlatformAdmin = isFirstUser,
            organizationId = org.Id,
            organizationName = org.Name
        });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user == null)
            return Unauthorized(new { message = "Invalid email or password" });

        var result = await _signInManager.PasswordSignInAsync(
            user, request.Password, isPersistent: true, lockoutOnFailure: false);

        if (!result.Succeeded)
            return Unauthorized(new { message = "Invalid email or password" });

        var roles = await _userManager.GetRolesAsync(user);
        var isPlatformAdmin = roles.Contains(RoleNames.PlatformAdmin);

        return Ok(new
        {
            userId = user.Id,
            email = user.Email,
            displayName = user.DisplayName,
            role = roles.FirstOrDefault(),
            isPlatformAdmin
        });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await _signInManager.SignOutAsync();
        return Ok(new { message = "Logged out" });
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Unauthorized();

        var roles = await _userManager.GetRolesAsync(user);
        var isPlatformAdmin = roles.Contains(RoleNames.PlatformAdmin);

        // Fetch all org memberships for this user
        var memberships = await _db.UserOrganizations
            .Where(uo => uo.UserId == user.Id)
            .Include(uo => uo.Organization)
            .Select(uo => new
            {
                organizationId = uo.OrganizationId,
                organizationName = uo.Organization.Name,
                role = uo.Role,
                isDefault = uo.IsDefault
            })
            .ToListAsync();

        return Ok(new
        {
            userId = user.Id,
            email = user.Email,
            displayName = user.DisplayName,
            role = roles.FirstOrDefault(),
            isPlatformAdmin,
            organizations = memberships
        });
    }

    [Authorize]
    [HttpPatch("me")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Unauthorized();

        if (!string.IsNullOrWhiteSpace(request.DisplayName))
        {
            user.DisplayName = request.DisplayName.Trim();
            var result = await _userManager.UpdateAsync(user);
            if (!result.Succeeded)
                return BadRequest(new { message = string.Join(", ", result.Errors.Select(e => e.Description)) });
        }

        return Ok(new
        {
            userId = user.Id,
            email = user.Email,
            displayName = user.DisplayName
        });
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.CurrentPassword) || string.IsNullOrWhiteSpace(request.NewPassword))
            return BadRequest(new { message = "Current password and new password are required" });

        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Unauthorized();

        var result = await _userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
            return BadRequest(new { message = string.Join(", ", result.Errors.Select(e => e.Description)) });

        // Refresh the sign-in cookie so the session isn't invalidated
        await _signInManager.RefreshSignInAsync(user);
        return Ok(new { message = "Password changed successfully" });
    }

    [HttpPost("forgot-password")]
    public IActionResult ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        // Email infrastructure is intentionally not implemented.
        // In a production deployment, this should:
        // 1. Find the user by email
        // 2. Generate a reset token via _userManager.GeneratePasswordResetTokenAsync(user)
        // 3. Send an email with IEmailSender / SMTP / SendGrid / Resend
        // 4. Return a generic 200 even if the email doesn't exist (prevents user enumeration)
        //
        // For this self-hosted portfolio setup, platform admins reset passwords via /api/platform/users/{id}/reset-password.
        return StatusCode(501, new
        {
            message = "Email-based password reset is not configured. Contact your platform administrator to reset your password.",
            adminResetEndpoint = "/api/platform/users/{userId}/reset-password"
        });
    }
}

