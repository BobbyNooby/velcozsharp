using System.Globalization;
using System.Text.Json;
using backend.Data;
using backend.Models.Dtos;
using backend.Models.Entities;
using backend.Models.Enums;
using CsvHelper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

[ApiController]
[Route("api/export")]
[Authorize]
public class ExportController : TenantControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public ExportController(AppDbContext db, UserManager<AppUser> userManager) : base(db, userManager)
    {
    }

    [HttpGet("assets")]
    public async Task<IActionResult> ExportAssets(
        [FromQuery] string? format,
        [FromQuery] Guid? departmentId,
        [FromQuery] Guid? assetTypeId,
        [FromQuery] AssetStatus? status,
        [FromQuery] string? severity,
        [FromQuery] string? search,
        [FromQuery] bool? hasVulnerabilities)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var query = _db.Assets
            .Include(a => a.AssetType)
            .Include(a => a.Department)
            .Where(a => a.OrganizationId == orgId.Value && a.Status != AssetStatus.Decommissioned)
            .AsQueryable();

        if (departmentId.HasValue) query = query.Where(a => a.DepartmentId == departmentId.Value);
        if (assetTypeId.HasValue) query = query.Where(a => a.AssetTypeId == assetTypeId.Value);
        if (status.HasValue) query = query.Where(a => a.Status == status.Value);
        if (!string.IsNullOrWhiteSpace(severity)) query = query.Where(a => a.HighestSeverity == severity);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(a => a.Name.ToLower().Contains(term));
        }
        if (hasVulnerabilities.HasValue)
            query = hasVulnerabilities.Value
                ? query.Where(a => a.Vulnerabilities.Any())
                : query.Where(a => !a.Vulnerabilities.Any());

        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new AssetExportRecord
            {
                Id = a.Id,
                Name = a.Name,
                Description = a.Description,
                Type = a.AssetType.Name,
                Department = a.Department.Name,
                Status = a.Status.ToString(),
                HighestSeverity = a.HighestSeverity,
                HighestCvssScore = a.HighestCvssScore,
                VulnerabilityCount = a.Vulnerabilities.Count,
                LastScannedAt = a.LastScannedAt,
                CreatedAt = a.CreatedAt
            })
            .ToListAsync();

        return format?.ToLower() == "json"
            ? File(JsonSerializer.SerializeToUtf8Bytes(items, JsonOptions), "application/json", "assets.json")
            : ToCsv(items, "assets.csv");
    }

    [HttpGet("vulnerabilities")]
    public async Task<IActionResult> ExportVulnerabilities(
        [FromQuery] string? format,
        [FromQuery] string? search,
        [FromQuery] string? severity,
        [FromQuery] string? status,
        [FromQuery] Guid? assetTypeId,
        [FromQuery] string? attackVector,
        [FromQuery] string? privilegesRequired,
        [FromQuery] string? userInteraction)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var query = _db.AssetVulnerabilities
            .Include(av => av.Vulnerability)
            .Include(av => av.Asset)
                .ThenInclude(a => a.AssetType)
            .Where(av => av.OrganizationId == orgId.Value)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(severity)) query = query.Where(av => av.Vulnerability.Severity == severity);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(av => av.Status == status);
        if (assetTypeId.HasValue) query = query.Where(av => av.Asset.AssetTypeId == assetTypeId.Value);
        if (!string.IsNullOrWhiteSpace(attackVector)) query = query.Where(av => av.Vulnerability.AttackVector != null && av.Vulnerability.AttackVector.ToLower() == attackVector.ToLower());
        if (!string.IsNullOrWhiteSpace(privilegesRequired)) query = query.Where(av => av.Vulnerability.PrivilegesRequired != null && av.Vulnerability.PrivilegesRequired.ToLower() == privilegesRequired.ToLower());
        if (!string.IsNullOrWhiteSpace(userInteraction)) query = query.Where(av => av.Vulnerability.UserInteraction != null && av.Vulnerability.UserInteraction.ToLower() == userInteraction.ToLower());
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(av =>
                av.Vulnerability.CveId.ToLower().Contains(term) ||
                (av.Vulnerability.Description != null && av.Vulnerability.Description.ToLower().Contains(term)));
        }

        var items = await query
            .OrderByDescending(av => av.DetectedAt)
            .Select(av => new VulnerabilityExportRecord
            {
                AssetId = av.AssetId,
                AssetName = av.Asset.Name,
                AssetType = av.Asset.AssetType.Name,
                CveId = av.Vulnerability.CveId,
                Description = av.Vulnerability.Description,
                Severity = av.Vulnerability.Severity,
                CvssScore = av.Vulnerability.CvssScore,
                AttackVector = av.Vulnerability.AttackVector,
                PrivilegesRequired = av.Vulnerability.PrivilegesRequired,
                UserInteraction = av.Vulnerability.UserInteraction,
                Status = av.Status,
                DetectedAt = av.DetectedAt,
                PublishedDate = av.Vulnerability.PublishedDate
            })
            .ToListAsync();

        return format?.ToLower() == "json"
            ? File(JsonSerializer.SerializeToUtf8Bytes(items, JsonOptions), "application/json", "vulnerabilities.json")
            : ToCsv(items, "vulnerabilities.csv");
    }

    [HttpGet("scan-jobs")]
    public async Task<IActionResult> ExportScanJobs([FromQuery] string? format)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var items = await _db.ScanJobs
            .Where(j => j.OrganizationId == orgId.Value)
            .OrderByDescending(j => j.CreatedAt)
            .Select(j => new ScanJobExportRecord
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

        return format?.ToLower() == "json"
            ? File(JsonSerializer.SerializeToUtf8Bytes(items, JsonOptions), "application/json", "scan-jobs.json")
            : ToCsv(items, "scan-jobs.csv");
    }

    [HttpGet("audit-logs")]
    public async Task<IActionResult> ExportAuditLogs(
        [FromQuery] string? format,
        [FromQuery] string? action,
        [FromQuery] string? entityType)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var query = _db.AuditLogs
            .Where(a => a.OrganizationId == orgId.Value)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(action)) query = query.Where(a => a.Action == action);
        if (!string.IsNullOrWhiteSpace(entityType)) query = query.Where(a => a.EntityType == entityType);

        var items = await query
            .OrderByDescending(a => a.Timestamp)
            .Select(a => new AuditLogExportRecord
            {
                Id = a.Id,
                Action = a.Action,
                EntityType = a.EntityType,
                EntityId = a.EntityId,
                ChangedByUserId = a.ChangedByUserId,
                Timestamp = a.Timestamp,
                BeforeJson = a.BeforeJson,
                AfterJson = a.AfterJson
            })
            .ToListAsync();

        return format?.ToLower() == "json"
            ? File(JsonSerializer.SerializeToUtf8Bytes(items, JsonOptions), "application/json", "audit-logs.json")
            : ToCsv(items, "audit-logs.csv");
    }

    private static FileContentResult ToCsv<T>(IEnumerable<T> records, string fileName)
    {
        using var writer = new StringWriter();
        using var csv = new CsvWriter(writer, CultureInfo.InvariantCulture);
        csv.WriteRecords(records);
        var bytes = System.Text.Encoding.UTF8.GetBytes(writer.ToString());
        return new FileContentResult(bytes, "text/csv") { FileDownloadName = fileName };
    }
}

public class AssetExportRecord
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string Type { get; set; } = "";
    public string Department { get; set; } = "";
    public string Status { get; set; } = "";
    public string? HighestSeverity { get; set; }
    public double? HighestCvssScore { get; set; }
    public int VulnerabilityCount { get; set; }
    public DateTime? LastScannedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class VulnerabilityExportRecord
{
    public Guid AssetId { get; set; }
    public string AssetName { get; set; } = "";
    public string AssetType { get; set; } = "";
    public string CveId { get; set; } = "";
    public string? Description { get; set; }
    public string? Severity { get; set; }
    public double? CvssScore { get; set; }
    public string? AttackVector { get; set; }
    public string? PrivilegesRequired { get; set; }
    public string? UserInteraction { get; set; }
    public string Status { get; set; } = "";
    public DateTime? DetectedAt { get; set; }
    public DateTime? PublishedDate { get; set; }
}

public class ScanJobExportRecord
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
}

public class AuditLogExportRecord
{
    public Guid Id { get; set; }
    public string Action { get; set; } = "";
    public string EntityType { get; set; } = "";
    public string EntityId { get; set; } = "";
    public string? ChangedByUserId { get; set; }
    public DateTime Timestamp { get; set; }
    public string? BeforeJson { get; set; }
    public string? AfterJson { get; set; }
}
