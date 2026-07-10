using backend.Data;
using backend.Models.Entities;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

public class AuditLogResponse
{
    public Guid Id { get; set; }
    public string Action { get; set; } = "";
    public string EntityType { get; set; } = "";
    public string EntityId { get; set; } = "";
    public string? BeforeJson { get; set; }
    public string? AfterJson { get; set; }
    public string? ChangedByUserId { get; set; }
    public DateTime Timestamp { get; set; }
}

[ApiController]
[Route("api/audit-logs")]
[Authorize]
public class AuditLogsController : TenantControllerBase
{
    public AuditLogsController(AppDbContext db, UserManager<AppUser> userManager)
        : base(db, userManager)
    {
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? action,
        [FromQuery] string? entityType,
        [FromQuery] string? entityId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 50;

        var query = _db.AuditLogs
            .Where(l => l.OrganizationId == orgId.Value)
            .OrderByDescending(l => l.Timestamp)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(action))
            query = query.Where(l => l.Action == action);

        if (!string.IsNullOrWhiteSpace(entityType))
            query = query.Where(l => l.EntityType == entityType);

        if (!string.IsNullOrWhiteSpace(entityId))
            query = query.Where(l => l.EntityId == entityId);

        var total = await query.CountAsync();

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(l => new AuditLogResponse
            {
                Id = l.Id,
                Action = l.Action,
                EntityType = l.EntityType,
                EntityId = l.EntityId,
                BeforeJson = l.BeforeJson,
                AfterJson = l.AfterJson,
                ChangedByUserId = l.ChangedByUserId,
                Timestamp = l.Timestamp
            })
            .ToListAsync();

        return Ok(new { items, totalCount = total, page, pageSize });
    }
}
