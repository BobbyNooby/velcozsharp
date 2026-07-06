namespace backend.Models.Entities;

public class Organization
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? NvdApiKey { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<AppUser> Users { get; set; } = [];
    public List<Department> Departments { get; set; } = [];
    public List<AssetTypeDefinition> AssetTypes { get; set; } = [];
    public List<Asset> Assets { get; set; } = [];
    public List<ScanJob> ScanJobs { get; set; } = [];
    public List<AuditLog> AuditLogs { get; set; } = [];
}
