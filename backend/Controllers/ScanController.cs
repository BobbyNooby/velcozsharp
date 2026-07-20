using backend.Data;
using backend.Infrastructure.Pagination;
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
[Route("api/scan")]
[Authorize]
public class ScanController : TenantControllerBase
{
    private readonly ICveMappingService _cveMapping;
    private readonly ILogger<ScanController> _logger;

    public ScanController(
        AppDbContext db,
        UserManager<AppUser> userManager,
        ICveMappingService cveMapping,
        ILogger<ScanController> logger)
        : base(db, userManager)
    {
        _cveMapping = cveMapping;
        _logger = logger;
    }

    [HttpGet("jobs/summary")]
    public async Task<IActionResult> GetJobSummary()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var summary = await _db.ScanJobs
            .Where(j => j.OrganizationId == orgId.Value)
            .GroupBy(j => j.Status)
            .Select(g => new { Status = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count);

        foreach (var status in Enum.GetNames<ScanJobStatus>())
        {
            if (!summary.ContainsKey(status))
                summary[status] = 0;
        }

        return Ok(summary);
    }

    [HttpPost("assets/{assetId:guid}")]
    public async Task<IActionResult> ScanAsset(Guid assetId, [FromQuery] bool useAi = false)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst);
        if (auth != null) return auth;

        var asset = await _db.Assets
            .FirstOrDefaultAsync(a => a.Id == assetId && a.OrganizationId == orgId.Value);

        if (asset == null) return NotFound();

        var org = await _db.Organizations.FindAsync(orgId.Value);
        var effectiveUseAi = useAi || (org?.IsAiEnabled ?? false);

        var job = new ScanJob
        {
            Id = Guid.NewGuid(),
            OrganizationId = orgId.Value,
            Type = ScanJobType.Single,
            Status = ScanJobStatus.Queued,
            UseAi = effectiveUseAi,
            TargetAssetIds = [assetId],
            TotalAssets = 1,
            CreatedAt = DateTime.UtcNow
        };

        _db.ScanJobs.Add(job);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Queued single scan job {JobId} for asset {AssetId}", job.Id, assetId);

        return Accepted(new { jobId = job.Id, message = "Scan job queued", status = "Queued" });
    }

    [HttpPost("assets/bulk")]
    public async Task<IActionResult> ScanBulk([FromBody] BulkScanRequest request, [FromQuery] bool useAi = false)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst);
        if (auth != null) return auth;

        if (request.AssetIds == null || request.AssetIds.Count == 0)
            return BadRequest(new { message = "No asset IDs provided" });

        var assetIds = request.AssetIds.Distinct().ToList();
        var validAssets = await _db.Assets
            .Where(a => assetIds.Contains(a.Id) && a.OrganizationId == orgId.Value)
            .Select(a => a.Id)
            .ToListAsync();

        var invalidIds = assetIds.Except(validAssets).ToList();
        if (invalidIds.Count > 0)
            return BadRequest(new { message = "Assets not found in organization" });

        var org = await _db.Organizations.FindAsync(orgId.Value);
        var effectiveUseAi = useAi || (org?.IsAiEnabled ?? false);

        var job = new ScanJob
        {
            Id = Guid.NewGuid(),
            OrganizationId = orgId.Value,
            Type = ScanJobType.Bulk,
            Status = ScanJobStatus.Queued,
            UseAi = effectiveUseAi,
            TargetAssetIds = validAssets,
            TotalAssets = validAssets.Count,
            CreatedAt = DateTime.UtcNow
        };

        _db.ScanJobs.Add(job);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Queued bulk scan job {JobId} for {Count} assets", job.Id, validAssets.Count);

        return Accepted(new { jobId = job.Id, message = "Bulk scan job queued", totalAssets = validAssets.Count, status = "Queued" });
    }

    [HttpPost("assets/all")]
    public async Task<IActionResult> ScanAll([FromQuery] bool useAi = false)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst);
        if (auth != null) return auth;

        var assetIds = await _db.Assets
            .Where(a => a.OrganizationId == orgId.Value && a.Status != AssetStatus.Decommissioned)
            .Select(a => a.Id)
            .ToListAsync();

        if (assetIds.Count == 0)
            return Ok(new { message = "No assets to scan", scanned = 0 });

        var org = await _db.Organizations.FindAsync(orgId.Value);
        var effectiveUseAi = useAi || (org?.IsAiEnabled ?? false);

        var job = new ScanJob
        {
            Id = Guid.NewGuid(),
            OrganizationId = orgId.Value,
            Type = ScanJobType.All,
            Status = ScanJobStatus.Queued,
            UseAi = effectiveUseAi,
            TotalAssets = assetIds.Count,
            CreatedAt = DateTime.UtcNow
        };

        _db.ScanJobs.Add(job);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Queued all-assets scan job {JobId} for {Count} assets", job.Id, assetIds.Count);

        return Accepted(new { jobId = job.Id, message = "Scan all job queued", totalAssets = assetIds.Count, status = "Queued" });
    }

    [HttpGet("jobs")]
    public async Task<IActionResult> GetJobs(
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        var query = _db.ScanJobs
            .Where(j => j.OrganizationId == orgId.Value)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<ScanJobStatus>(status, true, out var jobStatus))
            query = query.Where(j => j.Status == jobStatus);

        var result = await query
            .OrderByDescending(j => j.CreatedAt)
            .Select(j => new ScanJobResponse
            {
                Id = j.Id,
                Type = j.Type.ToString(),
                Status = j.Status.ToString(),
                TotalAssets = j.TotalAssets,
                ProcessedAssets = j.ProcessedAssets,
                NewVulnerabilitiesFound = j.NewVulnerabilitiesFound,
                UseAi = j.UseAi,
                CurrentAssetName = j.CurrentAssetName,
                ErrorMessage = j.ErrorMessage,
                CreatedAt = j.CreatedAt,
                StartedAt = j.StartedAt,
                CompletedAt = j.CompletedAt
            })
            .ToPagedResultAsync(page, pageSize);

        return Ok(result);
    }

    [HttpPost("jobs/{id:guid}/cancel")]
    public async Task<IActionResult> CancelJob(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var job = await _db.ScanJobs
            .FirstOrDefaultAsync(j => j.Id == id && j.OrganizationId == orgId.Value);

        if (job == null) return NotFound();

        if (job.Status != ScanJobStatus.Queued)
            return BadRequest(new { message = "Only queued jobs can be cancelled" });

        job.Status = ScanJobStatus.Cancelled;
        job.CompletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { jobId = job.Id, status = job.Status.ToString() });
    }

    [HttpPost("jobs/{id:guid}/retry")]
    public async Task<IActionResult> RetryJob(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var job = await _db.ScanJobs
            .FirstOrDefaultAsync(j => j.Id == id && j.OrganizationId == orgId.Value);

        if (job == null) return NotFound();

        if (job.Status != ScanJobStatus.Failed && job.Status != ScanJobStatus.Cancelled)
            return BadRequest(new { message = "Only failed or cancelled jobs can be retried" });

        job.Status = ScanJobStatus.Queued;
        job.ErrorMessage = null;
        job.CompletedAt = null;
        await _db.SaveChangesAsync();

        return Ok(new { jobId = job.Id, status = job.Status.ToString() });
    }

    [HttpGet("jobs/{id:guid}")]
    public async Task<IActionResult> GetJob(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var job = await _db.ScanJobs
            .Where(j => j.Id == id && j.OrganizationId == orgId.Value)
            .Select(j => new ScanJobResponse
            {
                Id = j.Id,
                Type = j.Type.ToString(),
                Status = j.Status.ToString(),
                TotalAssets = j.TotalAssets,
                ProcessedAssets = j.ProcessedAssets,
                NewVulnerabilitiesFound = j.NewVulnerabilitiesFound,
                UseAi = j.UseAi,
                CurrentAssetName = j.CurrentAssetName,
                ErrorMessage = j.ErrorMessage,
                CreatedAt = j.CreatedAt,
                StartedAt = j.StartedAt,
                CompletedAt = j.CompletedAt
            })
            .FirstOrDefaultAsync();

        if (job == null) return NotFound();

        return Ok(job);
    }
}
