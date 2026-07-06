namespace backend.Models.Entities;

public class AssetTypeDefinition
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? IconName { get; set; }
    public bool IsActive { get; set; } = true;

    public List<AssetTypeField> Fields { get; set; } = [];
    public List<Asset> Assets { get; set; } = [];
}
