using backend.Data;
using backend.Models.Entities;
using System.Text.Json;

namespace backend.Services;

public interface IAuditLogService
{
    Task LogAsync(string action, string entityType, string entityId, string? beforeJson = null, string? afterJson = null);
    Task LogAsync(string action, string entityType, string entityId, object? before = null, object? after = null);
}

public class AuditLogService : IAuditLogService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly IHttpContextAccessor _httpContextAccessor;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public AuditLogService(IServiceProvider serviceProvider, IHttpContextAccessor httpContextAccessor)
    {
        _serviceProvider = serviceProvider;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task LogAsync(string action, string entityType, string entityId, string? beforeJson = null, string? afterJson = null)
    {
        // Get user ID from current request context
        var userId = _httpContextAccessor.HttpContext?.User?.Identity?.IsAuthenticated == true
            ? _httpContextAccessor.HttpContext.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            : null;

        // Get org ID from header
        var orgIdHeader = _httpContextAccessor.HttpContext?.Request.Headers["X-Organization-Id"].FirstOrDefault();
        Guid? orgId = null;
        if (Guid.TryParse(orgIdHeader, out var parsedOrgId))
            orgId = parsedOrgId;

        if (!orgId.HasValue)
        {
            // Try to get from tenant context if available
            using var scope = _serviceProvider.CreateScope();
            var tenantContext = scope.ServiceProvider.GetService<ITenantContext>();
            if (tenantContext != null && tenantContext.OrganizationId != Guid.Empty)
                orgId = tenantContext.OrganizationId;
        }

        if (!orgId.HasValue) return; // Can't log without org context

        using var dbScope = _serviceProvider.CreateScope();
        var db = dbScope.ServiceProvider.GetRequiredService<AppDbContext>();

        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            OrganizationId = orgId.Value,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            BeforeJson = beforeJson,
            AfterJson = afterJson,
            ChangedByUserId = userId,
            Timestamp = DateTime.UtcNow
        });

        await db.SaveChangesAsync();
    }

    public async Task LogAsync(string action, string entityType, string entityId, object? before = null, object? after = null)
    {
        var beforeJson = before != null ? JsonSerializer.Serialize(before, JsonOptions) : null;
        var afterJson = after != null ? JsonSerializer.Serialize(after, JsonOptions) : null;
        await LogAsync(action, entityType, entityId, beforeJson, afterJson);
    }
}
