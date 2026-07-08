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

        try
        {
            var matches = await _cveMapping.ScanAssetAsync(assetId, orgId.Value);

            return Ok(new
            {
                assetId,
                scannedAt = DateTime.UtcNow,
                vulnerabilitiesFound = matches.Count,
                matches = matches.Select(m => new
                {
                    cveId = m.Vulnerability?.CveId,
                    description = m.Vulnerability?.Description,
                    cvssScore = m.Vulnerability?.CvssScore,
                    severity = m.Vulnerability?.Severity,
                    matchedKeyword = m.MatchedKeyword,
                    detectedAt = m.DetectedAt
                })
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Scan failed for asset {AssetId}", assetId);
            return StatusCode(500, new { message = "Scan failed", error = ex.Message });
        }
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
            return BadRequest(new { message = $"Assets not found in organization" });

        var results = new List<object>();

        foreach (var id in validAssets)
        {
            try
            {
                await Task.Delay(1000);
                var matches = await _cveMapping.ScanAssetAsync(id, orgId.Value);
                results.Add(new { assetId = id, success = true, vulnerabilitiesFound = matches.Count });
            }
            catch (Exception ex)
            {
                results.Add(new { assetId = id, success = false, error = ex.Message });
            }
        }

        return Ok(new
        {
            totalRequested = request.AssetIds.Count,
            totalScanned = validAssets.Count,
            results
        });
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

        var results = new List<object>();
        var totalFound = 0;

        foreach (var id in assetIds)
        {
            try
            {
                await Task.Delay(1000);
                var matches = await _cveMapping.ScanAssetAsync(id, orgId.Value);
                totalFound += matches.Count;
                results.Add(new { assetId = id, success = true, count = matches.Count });
            }
            catch (Exception ex)
            {
                results.Add(new { assetId = id, success = false, error = ex.Message });
            }
        }

        return Ok(new
        {
            totalAssets = assetIds.Count,
            totalVulnerabilitiesFound = totalFound,
            results
        });
    }
}
