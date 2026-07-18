using backend.Models.Dtos;
using backend.Models.Entities;

namespace backend.Infrastructure.Mapping;

public static class AssetTypeMappingExtensions
{
    public static AssetTypeResponse ToResponse(this AssetTypeDefinition assetType)
    {
        return new AssetTypeResponse
        {
            Id = assetType.Id,
            Name = assetType.Name,
            Description = assetType.Description,
            IconName = assetType.IconName,
            IsActive = assetType.IsActive,
            Fields = assetType.Fields
                .OrderBy(f => f.DisplayOrder)
                .Select(f => f.ToResponse())
                .ToList()
        };
    }

    public static AssetTypeFieldResponse ToResponse(this AssetTypeField field)
    {
        return new AssetTypeFieldResponse
        {
            Id = field.Id,
            Name = field.Name,
            DataType = field.DataType,
            IsRequired = field.IsRequired,
            IsCveSearchable = field.IsCveSearchable,
            DisplayOrder = field.DisplayOrder,
            DefaultValue = field.DefaultValue
        };
    }
}
