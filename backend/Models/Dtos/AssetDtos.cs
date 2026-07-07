using backend.Models.Enums;

namespace backend.Models.Dtos;

public class CreateAssetRequest
{
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public Guid AssetTypeId { get; set; }
    public Guid DepartmentId { get; set; }
    public Dictionary<string, object> Properties { get; set; } = new();
}

public class UpdateAssetRequest
{
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public Guid DepartmentId { get; set; }
    public AssetStatus Status { get; set; }
    public Dictionary<string, object> Properties { get; set; } = new();
}

public class AssetResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }

    public Guid AssetTypeId { get; set; }
    public string AssetTypeName { get; set; } = "";

    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = "";

    public AssetStatus Status { get; set; }
    public Dictionary<string, object> Properties { get; set; } = new();

    public double? HighestCvssScore { get; set; }
    public string? HighestSeverity { get; set; }
    public DateTime? LastScannedAt { get; set; }

    public int VulnerabilityCount { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
