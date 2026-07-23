using backend.Data;
using backend.Models.Entities;
using backend.Models.Enums;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/ai")]
[Authorize]
public class AiController : TenantControllerBase
{
    private readonly IOpenRouterService _openRouter;

    public AiController(AppDbContext db, UserManager<AppUser> userManager, IOpenRouterService openRouter)
        : base(db, userManager)
    {
        _openRouter = openRouter;
    }

    [HttpPost("chat")]
    public async Task<IActionResult> Chat([FromBody] AiChatRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst);
        if (auth != null) return auth;

        var org = await _db.Organizations.FindAsync(orgId.Value);
        if (org == null || !org.IsAiEnabled)
            return BadRequest(new { message = "AI features are not enabled for this organization." });

        if (string.IsNullOrWhiteSpace(request.Message))
            return BadRequest(new { message = "Message is required" });

        try
        {
            var reply = await _openRouter.ChatAsync(request.Message, request.RequireJson);
            return Ok(new AiChatResponse { Reply = reply });
        }
        catch (HttpRequestException ex)
        {
            return StatusCode(502, new { message = $"OpenRouter API error: {ex.Message}" });
        }
    }
}

public class AiChatRequest
{
    public string Message { get; set; } = "";
    public bool RequireJson { get; set; }
}

public class AiChatResponse
{
    public string Reply { get; set; } = "";
}