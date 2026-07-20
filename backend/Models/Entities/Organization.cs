namespace backend.Models.Entities;

public class Organization
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? NvdApiKey { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsAiEnabled { get; set; } = false;

    // AI scan tuning (per-organization)
    public int AiChunkSize { get; set; } = 50;
    public int? AiMaxCvesPerAsset { get; set; }
    public int AiMinScore { get; set; } = 0;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<UserOrganization> UserOrganizations { get; set; } = [];
    public List<Department> Departments { get; set; } = [];
    public List<AssetTypeDefinition> AssetTypes { get; set; } = [];
    public List<Asset> Assets { get; set; } = [];
    public List<ScanJob> ScanJobs { get; set; } = [];
    public List<AuditLog> AuditLogs { get; set; } = [];
    public List<RecurringScanConfig> ScanSchedules { get; set; } = [];
}
