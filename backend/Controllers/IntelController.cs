using backend.Data;
using backend.Models.Entities;
using backend.Models.Enums;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

[ApiController]
[Route("api/intel")]
[Authorize]
public class IntelController : TenantControllerBase
{
    private readonly IValyuService _valyu;
    private readonly IThreatIntelService _intel;

    public IntelController(AppDbContext db, UserManager<AppUser> userManager,
        IValyuService valyu, IThreatIntelService intel)
        : base(db, userManager)
    {
        _valyu = valyu;
        _intel = intel;
    }

    /// <summary>Reports whether Valyu is configured and AI rerank is available. Costs nothing.</summary>
    [HttpGet("status")]
    public async Task<IActionResult> Status()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var org = await _db.Organizations.FindAsync([orgId.Value]);
        return Ok(new IntelStatusResponse
        {
            ValyuConfigured = _valyu.IsConfigured,
            AiEnabled = org?.IsAiEnabled ?? false
        });
    }

    [HttpPost("brief")]
    public async Task<IActionResult> Brief([FromBody] ThreatIntelBriefOptions request)
    {
        var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst);
        if (auth != null) return auth;

        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        if (!_valyu.IsConfigured)
            return BadRequest(new { message = "Valyu API key is not configured. Set \"Valyu:ApiKey\" in user-secrets or environment." });

        try
        {
            var brief = await _intel.GenerateBriefAsync(orgId.Value, request);
            return Ok(brief);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Starts a DeepResearch audit report: builds the research brief from the org's
    /// inventory, queues the task with Valyu, and returns 202 immediately.
    /// Progress lands via GET /api/intel/reports as the poller hydrates it.
    /// </summary>
    [HttpPost("reports")]
    public async Task<IActionResult> CreateReport([FromBody] IntelReportCreateRequest request, CancellationToken ct)
    {
        var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst);
        if (auth != null) return auth;

        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        if (!_valyu.IsConfigured)
            return BadRequest(new { message = "Valyu API key is not configured. Set \"Valyu:ApiKey\" in user-secrets or environment." });

        var mode = request.Mode == "standard" ? "standard" : "fast";
        var sinceDays = Math.Clamp(request.SinceDays, 1, 90);

        var brief = await _intel.BuildAuditBriefAsync(orgId.Value, sinceDays, ct);
        if (brief == null)
            return BadRequest(new { message = "Nothing to audit yet — add assets to this organization first." });

        ValyuDeepResearchCreateResponse task;
        try
        {
            task = await _valyu.CreateDeepResearchTaskAsync(new ValyuDeepResearchCreateRequest
            {
                Query = brief,
                Mode = mode,
                ResearchStrategy = "Prioritise primary and authoritative sources: vendor security advisories, NVD, CISA known exploited vulnerabilities, and reputable security press. Verify that each vulnerability actually applies to the product versions listed before calling it relevant.",
                ReportFormat = """
                    PRESENTATION RULES (mandatory):
                    - Begin with "## At a Glance": a compact 2-column scorecard table, e.g.
                      | | |
                      |---|---|
                      | Overall risk | CRITICAL (9/10) |
                      | Actively exploited | 3 confirmed (GitLab, Windows, QNAP) |
                      | No patch available | 5 assets on EOL software |
                      | Urgent deadlines | 2 (today / next week) |
                      | CRIT / HIGH / MED / LOW | 4 / 8 / 3 / 0 |
                      Every number must match the body of the report.
                    - Executive summary: max 5 bullets, ONE line each (≤25 words). Citations belong in the body, not here.
                    - Each vulnerability = a compact card: "### <CVE-id> — <product> · <asset name>" then a 2-column table (Severity / Exploitation status / Fix / Deadline) and AT MOST 3 sentences of context with citations.
                    - Use tables for anything with 3+ attributes. No paragraph longer than 3 sentences. Never repeat the same citation more than twice.
                    - Open each major section (after At a Glance) with a one-line "> TL;DR: …" blockquote.
                    - Keep section headings short and stable — exactly: "Actively Exploited Vulnerabilities", "New Vendor Advisories and Patches", "Threat Landscape", "Compliance and Disclosure Changes", "Recommended Actions".
                    - End with "## Recommended Actions" as a task list grouped by deadline: "- [ ] (24h) Update Photo Station on dev-nas to ≥ 5.7.18".

                    STRUCTURE (exact order):
                    1. At a Glance (scorecard table)
                    2. Executive summary (5 one-line bullets)
                    3. Actively Exploited Vulnerabilities — compact cards, worst first
                    4. New Vendor Advisories and Patches — grouped by product
                    5. Threat Landscape — campaigns relevant to these products
                    6. Compliance and Disclosure Changes
                    7. Recommended Actions — checkbox task list: (24h) / (7d) / (30d)
                    Every claim in the body must carry an inline citation link. If evidence for a section is thin, say so explicitly rather than padding.
                    """,
                OutputFormats = ["markdown", "pdf"]
            }, ct);
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(502, new { message = ex.Message });
        }

        var report = new IntelReport
        {
            Id = Guid.NewGuid(),
            OrganizationId = orgId.Value,
            TaskId = task.DeepResearchId,
            Title = $"Security Audit — {DateTime.UtcNow:dd MMM yyyy HH:mm} UTC",
            Mode = mode,
            Status = task.Status == "queued" ? "Queued" : "Running",
            Query = brief,
            StartedAt = DateTime.UtcNow
        };
        _db.IntelReports.Add(report);
        await _db.SaveChangesAsync(ct);

        return Accepted(new
        {
            reportId = report.Id,
            taskId = report.TaskId,
            title = report.Title,
            mode = report.Mode,
            status = report.Status,
            startedAt = report.StartedAt
        });
    }

    [HttpGet("reports")]
    public async Task<IActionResult> ListReports(CancellationToken ct)
    {
        var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst);
        if (auth != null) return auth;

        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var reports = await _db.IntelReports
            .OrderByDescending(r => r.StartedAt)
            .Take(50)
            .Select(r => new IntelReportListItem
            {
                Id = r.Id,
                Title = r.Title,
                Mode = r.Mode,
                Status = r.Status,
                CurrentStep = r.CurrentStep,
                TotalSteps = r.TotalSteps,
                StartedAt = r.StartedAt,
                CompletedAt = r.CompletedAt,
                CostUsd = r.CostUsd,
                SourceCount = r.SourceCount,
                ErrorMessage = r.ErrorMessage
            })
            .ToListAsync(ct);

        return Ok(reports);
    }

    [HttpGet("reports/{id:guid}")]
    public async Task<IActionResult> GetReport(Guid id, CancellationToken ct)
    {
        var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst);
        if (auth != null) return auth;

        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var report = await _db.IntelReports.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (report == null) return NotFound();

        return Ok(new IntelReportDetail
        {
            Id = report.Id,
            Title = report.Title,
            Mode = report.Mode,
            Status = report.Status,
            CurrentStep = report.CurrentStep,
            TotalSteps = report.TotalSteps,
            StartedAt = report.StartedAt,
            CompletedAt = report.CompletedAt,
            CostUsd = report.CostUsd,
            SourceCount = report.SourceCount,
            ErrorMessage = report.ErrorMessage,
            ReportMarkdown = report.ReportMarkdown,
            PdfUrl = report.PdfUrl
        });
    }
}

public class IntelStatusResponse
{
    public bool ValyuConfigured { get; set; }
    public bool AiEnabled { get; set; }
}

public class IntelReportCreateRequest
{
    /// <summary>fast (~5 min, ~$0.10) or standard (~10-20 min, ~$0.50)</summary>
    public string Mode { get; set; } = "fast";
    public int SinceDays { get; set; } = 30;
}

public class IntelReportListItem
{
    public Guid Id { get; set; }
    public string Title { get; set; } = "";
    public string Mode { get; set; } = "";
    public string Status { get; set; } = "";
    public int? CurrentStep { get; set; }
    public int? TotalSteps { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public decimal? CostUsd { get; set; }
    public int? SourceCount { get; set; }
    public string? ErrorMessage { get; set; }
}

public class IntelReportDetail : IntelReportListItem
{
    public string? ReportMarkdown { get; set; }
    public string? PdfUrl { get; set; }
}
