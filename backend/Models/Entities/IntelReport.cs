namespace backend.Models.Entities;

/// <summary>
/// A DeepResearch-backed security audit report for an organization.
/// StartedAt is captured the moment the task is queued; the report itself
/// lives in Valyu, we persist the task id and hydrate progress from it.
/// </summary>
public class IntelReport
{
    public Guid Id { get; set; }

    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    /// <summary>Valyu DeepResearch task id (deepresearch_id) — the canonical remote reference.</summary>
    public string TaskId { get; set; } = "";

    public string Title { get; set; } = "";

    /// <summary>fast | standard</summary>
    public string Mode { get; set; } = "fast";

    /// <summary>Queued | Running | Completed | Failed</summary>
    public string Status { get; set; } = "Queued";

    /// <summary>The research brief that was sent to Valyu.</summary>
    public string Query { get; set; } = "";

    public int? CurrentStep { get; set; }
    public int? TotalSteps { get; set; }

    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }

    public decimal? CostUsd { get; set; }
    public int? SourceCount { get; set; }

    public string? ReportMarkdown { get; set; }
    public string? PdfUrl { get; set; }
    public string? ErrorMessage { get; set; }
}
