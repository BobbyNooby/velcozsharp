using backend.Data;
using backend.Models.Dtos;
using backend.Models.Entities;
using backend.Models.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

public class CreateScanScheduleRequest
{
    public string Name { get; set; } = "";
    public string CronExpression { get; set; } = "0 2 * * *";
    public string Scope { get; set; } = "All";
    public List<Guid>? TargetAssetIds { get; set; }
}

public class UpdateScanScheduleRequest
{
    public string? Name { get; set; }
    public string? CronExpression { get; set; }
    public string? Scope { get; set; }
    public List<Guid>? TargetAssetIds { get; set; }
    public bool? Enabled { get; set; }
}

public class ScanScheduleResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string CronExpression { get; set; } = "";
    public string Scope { get; set; } = "";
    public List<Guid>? TargetAssetIds { get; set; }
    public bool Enabled { get; set; }
    public DateTime? LastRunAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

[ApiController]
[Route("api/scan-schedules")]
[Authorize]
public class ScanScheduleController : TenantControllerBase
{
    public ScanScheduleController(AppDbContext db, UserManager<AppUser> userManager)
        : base(db, userManager)
    {
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var schedules = await _db.RecurringScanConfigs
            .OrderBy(rc => rc.Name)
            .Select(rc => new ScanScheduleResponse
            {
                Id = rc.Id,
                Name = rc.Name,
                CronExpression = rc.CronExpression,
                Scope = rc.Scope.ToString(),
                TargetAssetIds = rc.TargetAssetIds,
                Enabled = rc.Enabled,
                LastRunAt = rc.LastRunAt,
                CreatedAt = rc.CreatedAt
            })
            .ToListAsync();

        return Ok(schedules);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var schedule = await _db.RecurringScanConfigs
            .Where(rc => rc.Id == id)
            .Select(rc => new ScanScheduleResponse
            {
                Id = rc.Id,
                Name = rc.Name,
                CronExpression = rc.CronExpression,
                Scope = rc.Scope.ToString(),
                TargetAssetIds = rc.TargetAssetIds,
                Enabled = rc.Enabled,
                LastRunAt = rc.LastRunAt,
                CreatedAt = rc.CreatedAt
            })
            .FirstOrDefaultAsync();

        if (schedule == null) return NotFound();
        return Ok(schedule);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateScanScheduleRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Name is required" });

        if (string.IsNullOrWhiteSpace(request.CronExpression))
            return BadRequest(new { message = "Cron expression is required" });

        // Validate cron expression
        try
        {
            Cronos.CronExpression.Parse(request.CronExpression);
        }
        catch
        {
            return BadRequest(new { message = "Invalid cron expression" });
        }

        if (!Enum.TryParse<ScanJobType>(request.Scope, true, out var scope))
            return BadRequest(new { message = "Invalid scope. Use: All, Bulk, or Single" });

        var schedule = new RecurringScanConfig
        {
            Id = Guid.NewGuid(),
            OrganizationId = orgId.Value,
            Name = request.Name,
            CronExpression = request.CronExpression,
            Scope = scope,
            TargetAssetIds = scope == ScanJobType.Bulk ? request.TargetAssetIds : null,
            Enabled = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.RecurringScanConfigs.Add(schedule);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = schedule.Id }, new ScanScheduleResponse
        {
            Id = schedule.Id,
            Name = schedule.Name,
            CronExpression = schedule.CronExpression,
            Scope = schedule.Scope.ToString(),
            TargetAssetIds = schedule.TargetAssetIds,
            Enabled = schedule.Enabled,
            CreatedAt = schedule.CreatedAt
        });
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateScanScheduleRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var schedule = await _db.RecurringScanConfigs
            .FirstOrDefaultAsync(rc => rc.Id == id);

        if (schedule == null) return NotFound();

        if (request.Name != null)
            schedule.Name = request.Name;

        if (request.CronExpression != null)
        {
            try
            {
                Cronos.CronExpression.Parse(request.CronExpression);
            }
            catch
            {
                return BadRequest(new { message = "Invalid cron expression" });
            }
            schedule.CronExpression = request.CronExpression;
        }

        if (request.Scope != null && Enum.TryParse<ScanJobType>(request.Scope, true, out var scope))
        {
            schedule.Scope = scope;
            schedule.TargetAssetIds = scope == ScanJobType.Bulk ? request.TargetAssetIds : null;
        }

        if (request.Enabled.HasValue)
            schedule.Enabled = request.Enabled.Value;

        schedule.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var schedule = await _db.RecurringScanConfigs
            .FirstOrDefaultAsync(rc => rc.Id == id);

        if (schedule == null) return NotFound();

        _db.RecurringScanConfigs.Remove(schedule);
        await _db.SaveChangesAsync();

        return NoContent();
    }
}
