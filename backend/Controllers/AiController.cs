using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/ai")]
[Authorize]
public class AiController : ControllerBase
{
    private readonly IOpenRouterService _openRouter;

    public AiController(IOpenRouterService openRouter)
    {
        _openRouter = openRouter;
    }

    [HttpPost("chat")]
    public async Task<IActionResult> Chat([FromBody] AiChatRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
            return BadRequest(new { message = "Message is required" });

        try
        {
            var reply = await _openRouter.ChatAsync(request.Message);
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
}

public class AiChatResponse
{
    public string Reply { get; set; } = "";
}
