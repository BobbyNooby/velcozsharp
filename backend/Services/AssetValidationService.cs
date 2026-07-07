using backend.Data;
using backend.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public interface IAssetValidationService
{
    Task<(bool IsValid, string ErrorMessage)> ValidateAsync(Guid assetTypeId, Guid orgId, Dictionary<string, object> properties);
}

public class AssetValidationService : IAssetValidationService
{
    private readonly AppDbContext _db;

    public AssetValidationService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<(bool IsValid, string ErrorMessage)> ValidateAsync(Guid assetTypeId, Guid orgId, Dictionary<string, object> properties)
    {
        _db.CurrentOrganizationId = orgId;

        var assetType = await _db.AssetTypeDefinitions
            .Include(at => at.Fields)
            .FirstOrDefaultAsync(at => at.Id == assetTypeId && at.IsActive);

        if (assetType == null)
            return (false, "Asset type not found or inactive.");

        // Check all required fields are present
        foreach (var field in assetType.Fields.Where(f => f.IsRequired))
        {
            if (!properties.ContainsKey(field.Name) || properties[field.Name] == null)
                return (false, $"Required field '{field.Name}' is missing.");
        }

        // Check all provided keys exist in the schema (reject unknown keys)
        var allowedFieldNames = assetType.Fields.Select(f => f.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var key in properties.Keys)
        {
            if (!allowedFieldNames.Contains(key))
                return (false, $"Unknown field '{key}' is not defined in asset type schema.");
        }

        // Basic type coercion / validation
        foreach (var field in assetType.Fields)
        {
            if (!properties.ContainsKey(field.Name) || properties[field.Name] == null)
                continue;

            var value = properties[field.Name];
            var coerced = CoerceValue(value, field.DataType);
            if (coerced == null && field.IsRequired)
                return (false, $"Field '{field.Name}' could not be parsed as {field.DataType}.");

            properties[field.Name] = coerced ?? value;
        }

        return (true, string.Empty);
    }

    private static object? CoerceValue(object value, string dataType)
    {
        var str = value.ToString() ?? "";

        return dataType.ToLowerInvariant() switch
        {
            "number" or "int" or "integer" or "float" or "decimal" =>
                double.TryParse(str, out var d) ? d : null,
            "boolean" or "bool" =>
                bool.TryParse(str, out var b) ? b : null,
            "date" or "datetime" =>
                DateTime.TryParse(str, out var dt) ? dt.ToUniversalTime() : null,
            _ => str // text and everything else
        };
    }
}
