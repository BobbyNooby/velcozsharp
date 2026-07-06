namespace backend.Models.Entities;

public class AssetTypeField
{
    public Guid Id { get; set; }
    public Guid AssetTypeId { get; set; }
    public AssetTypeDefinition AssetType { get; set; } = null!;

    public string Name { get; set; } = "";
    public string DataType { get; set; } = "text";
    public bool IsRequired { get; set; }
    public bool IsCveSearchable { get; set; } = true;
    public int DisplayOrder { get; set; }
    public string? DefaultValue { get; set; }
}
