using backend.Data;
using backend.Models.Entities;
using backend.Models.Enums;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

public class BulkScanRequest
{
    public List<Guid> AssetIds { get; set; } = [];
}

public class ScanJobResponse
{
    public Guid Id { get; set; }
    public string Type { get; set; } = "";
    public string Status { get; set; } = "";
    public int TotalAssets { get; set; }
    public int ProcessedAssets { get; set; }
    public int NewVulnerabilitiesFound { get; set; }
    public string? CurrentAssetName { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public TimeSpan? Duration => CompletedAt.HasValue && StartedAt.HasValue
        ? CompletedAt.Value - StartedAt.Value
        : StartedAt.HasValue
            ? DateTime.UtcNow - StartedAt.Value
            : null;
}

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

    [HttpPost("assets/{assetId:guid}")]
    public async Task<IActionResult> ScanAsset(Guid assetId)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var asset = await _db.Assets
            .FirstOrDefaultAsync(a => a.Id == assetId && a.OrganizationId == orgId.Value);

        if (asset == null) return NotFound();

        var job = new ScanJob
        {
            Id = Guid.NewGuid(),
            OrganizationId = orgId.Value,
            Type = ScanJobType.Single,
            Status = ScanJobStatus.Queued,
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
    public async Task<IActionResult> ScanBulk([FromBody] BulkScanRequest request)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

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

        var job = new ScanJob
        {
            Id = Guid.NewGuid(),
            OrganizationId = orgId.Value,
            Type = ScanJobType.Bulk,
            Status = ScanJobStatus.Queued,
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
    public async Task<IActionResult> ScanAll()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var assetIds = await _db.Assets
            .Where(a => a.OrganizationId == orgId.Value && a.Status != AssetStatus.Decommissioned)
            .Select(a => a.Id)
            .ToListAsync();

        if (assetIds.Count == 0)
            return Ok(new { message = "No assets to scan", scanned = 0 });

        var job = new ScanJob
        {
            Id = Guid.NewGuid(),
            OrganizationId = orgId.Value,
            Type = ScanJobType.All,
            Status = ScanJobStatus.Queued,
            TotalAssets = assetIds.Count,
            CreatedAt = DateTime.UtcNow
        };

        _db.ScanJobs.Add(job);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Queued all-assets scan job {JobId} for {Count} assets", job.Id, assetIds.Count);

        return Accepted(new { jobId = job.Id, message = "Scan all job queued", totalAssets = assetIds.Count, status = "Queued" });
    }

    [HttpGet("jobs")]
    public async Task<IActionResult> GetJobs([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        var query = _db.ScanJobs
            .Where(j => j.OrganizationId == orgId.Value)
            .OrderByDescending(j => j.CreatedAt);

        var total = await query.CountAsync();

        var jobs = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(j => new ScanJobResponse
            {
                Id = j.Id,
                Type = j.Type.ToString(),
                Status = j.Status.ToString(),
                TotalAssets = j.TotalAssets,
                ProcessedAssets = j.ProcessedAssets,
                NewVulnerabilitiesFound = j.NewVulnerabilitiesFound,
                CurrentAssetName = j.CurrentAssetName,
                ErrorMessage = j.ErrorMessage,
                CreatedAt = j.CreatedAt,
                StartedAt = j.StartedAt,
                CompletedAt = j.CompletedAt
            })
            .ToListAsync();

        return Ok(new { items = jobs, totalCount = total, page, pageSize });
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
