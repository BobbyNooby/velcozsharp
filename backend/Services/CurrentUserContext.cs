using System.Security.Claims;

namespace backend.Services;

public class CurrentUserContext : ITenantContext
{
    public Guid OrganizationId { get; }
    public Guid UserId { get; }
    public string Role { get; } = "";

    public CurrentUserContext(IHttpContextAccessor httpContextAccessor)
    {
        var user = httpContextAccessor.HttpContext?.User;
        if (user?.Identity?.IsAuthenticated == true)
        {
            var userIdClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(userIdClaim, out var uid))
            {
                UserId = uid;
            }

            // Read org from header (per-request scoping, not session claim)
            var headerValue = httpContextAccessor.HttpContext?.Request.Headers["X-Organization-Id"].FirstOrDefault();
            if (Guid.TryParse(headerValue, out var oid))
            {
                OrganizationId = oid;
            }

            Role = user.FindFirst(ClaimTypes.Role)?.Value ?? "";
        }
    }
}
