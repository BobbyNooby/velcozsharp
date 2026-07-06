using backend.Models.Enums;

namespace backend.Models.Entities;

public class Asset
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }

    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    public Guid AssetTypeId { get; set; }
    public AssetTypeDefinition AssetType { get; set; } = null!;

    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;

    public AssetStatus Status { get; set; } = AssetStatus.Active;

    public Dictionary<string, object> Properties { get; set; } = new();

    public double? HighestCvssScore { get; set; }
    public string? HighestSeverity { get; set; }
    public DateTime? LastScannedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public List<AssetVulnerability> Vulnerabilities { get; set; } = [];
}
