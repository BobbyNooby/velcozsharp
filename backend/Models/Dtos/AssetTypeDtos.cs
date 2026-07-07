namespace backend.Models.Dtos;

public class AssetTypeFieldRequest
{
    public string Name { get; set; } = "";
    public string DataType { get; set; } = "text";
    public bool IsRequired { get; set; }
    public bool IsCveSearchable { get; set; } = true;
    public int DisplayOrder { get; set; }
    public string? DefaultValue { get; set; }
}

public class AssetTypeFieldResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string DataType { get; set; } = "text";
    public bool IsRequired { get; set; }
    public bool IsCveSearchable { get; set; }
    public int DisplayOrder { get; set; }
    public string? DefaultValue { get; set; }
}

public class CreateAssetTypeRequest
{
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? IconName { get; set; }
    public List<AssetTypeFieldRequest> Fields { get; set; } = [];
}

public class UpdateAssetTypeRequest
{
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? IconName { get; set; }
    public List<AssetTypeFieldRequest> Fields { get; set; } = [];
}

public class AssetTypeResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? IconName { get; set; }
    public bool IsActive { get; set; }
    public List<AssetTypeFieldResponse> Fields { get; set; } = [];
}
