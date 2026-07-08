using backend.Data;
using backend.Models.Entities;

namespace backend.Services;

public interface IAssetTypeTemplateService
{
    Task SeedBuiltInTypesAsync(Guid organizationId);
}

public class AssetTypeTemplateService : IAssetTypeTemplateService
{
    private readonly AppDbContext _db;

    public AssetTypeTemplateService(AppDbContext db)
    {
        _db = db;
    }

    public async Task SeedBuiltInTypesAsync(Guid organizationId)
    {
        var builtIns = GetBuiltInTemplates();
        foreach (var template in builtIns)
        {
            // Check if this template already exists for the org
            var exists = _db.AssetTypeDefinitions
                .Any(at => at.OrganizationId == organizationId && at.Name == template.Name && at.IsActive);
            
            if (exists) continue;

            var assetType = new AssetTypeDefinition
            {
                Id = Guid.NewGuid(),
                Name = template.Name,
                Description = template.Description,
                IconName = template.IconName,
                OrganizationId = organizationId,
                IsActive = true,
                Fields = template.Fields.Select((f, i) => new AssetTypeField
                {
                    Id = Guid.NewGuid(),
                    Name = f.Name,
                    DataType = f.DataType,
                    IsRequired = f.IsRequired,
                    IsCveSearchable = f.IsCveSearchable,
                    DisplayOrder = i,
                    DefaultValue = f.DefaultValue
                }).ToList()
            };

            _db.AssetTypeDefinitions.Add(assetType);
        }

        await _db.SaveChangesAsync();
    }

    private static List<AssetTypeTemplate> GetBuiltInTemplates()
    {
        return new List<AssetTypeTemplate>
        {
            new()
            {
                Name = "Laptop / Workstation",
                Description = "Employee laptops, desktops, and workstations",
                IconName = "laptop",
                Fields = new List<TemplateField>
                {
                    new("hostname", "text", true, false),
                    new("operating_system", "text", true, true),
                    new("os_version", "text", true, true),
                    new("model", "text", false, false),
                    new("serial_number", "text", false, false),
                    new("assigned_user", "text", false, false),
                }
            },
            new()
            {
                Name = "Server",
                Description = "Physical or virtual servers",
                IconName = "server",
                Fields = new List<TemplateField>
                {
                    new("hostname", "text", true, false),
                    new("operating_system", "text", true, true),
                    new("os_version", "text", true, true),
                    new("kernel_version", "text", false, true),
                    new("ip_address", "text", false, false),
                    new("cpu_cores", "number", false, false),
                    new("memory_gb", "number", false, false),
                }
            },
            new()
            {
                Name = "Network Device",
                Description = "Routers, switches, firewalls, access points",
                IconName = "wifi",
                Fields = new List<TemplateField>
                {
                    new("hostname", "text", true, false),
                    new("device_model", "text", true, false),
                    new("vendor", "text", true, true),
                    new("firmware_version", "text", true, true),
                    new("ip_address", "text", false, false),
                    new("mac_address", "text", false, false),
                }
            },
            new()
            {
                Name = "Smart Device / IoT",
                Description = "IoT devices, smart TVs, cameras, sensors",
                IconName = "cpu",
                Fields = new List<TemplateField>
                {
                    new("device_name", "text", true, false),
                    new("model", "text", true, false),
                    new("vendor", "text", true, true),
                    new("firmware_version", "text", true, true),
                    new("protocol", "text", false, false),
                    new("ip_address", "text", false, false),
                }
            },
            new()
            {
                Name = "Software / Application",
                Description = "Installed software, web applications, services",
                IconName = "code",
                Fields = new List<TemplateField>
                {
                    new("application_name", "text", true, true),
                    new("version", "text", true, true),
                    new("vendor", "text", true, true),
                    new("deployment_url", "text", false, false),
                    new("license_type", "text", false, false),
                    new("installation_path", "text", false, false),
                }
            },
            new()
            {
                Name = "Database",
                Description = "Database servers and instances",
                IconName = "database",
                Fields = new List<TemplateField>
                {
                    new("database_name", "text", true, true),
                    new("dbms_type", "text", true, true),
                    new("version", "text", true, true),
                    new("host", "text", false, false),
                    new("port", "number", false, false),
                    new("instance_name", "text", false, false),
                }
            },
            new()
            {
                Name = "Mobile Device",
                Description = "Smartphones and tablets",
                IconName = "smartphone",
                Fields = new List<TemplateField>
                {
                    new("device_name", "text", true, false),
                    new("model", "text", true, false),
                    new("os_name", "text", true, true),
                    new("os_version", "text", true, true),
                    new("assigned_user", "text", false, false),
                    new("imei", "text", false, false),
                }
            },
            new()
            {
                Name = "Web Application",
                Description = "External or internal web apps",
                IconName = "globe",
                Fields = new List<TemplateField>
                {
                    new("app_name", "text", true, false),
                    new("url", "text", true, false),
                    new("framework", "text", true, true),
                    new("framework_version", "text", true, true),
                    new("language", "text", false, true),
                    new("language_version", "text", false, true),
                }
            },
            new()
            {
                Name = "Cloud Resource",
                Description = "Cloud VMs, containers, storage, functions",
                IconName = "cloud",
                Fields = new List<TemplateField>
                {
                    new("resource_name", "text", true, false),
                    new("resource_type", "text", true, false),
                    new("provider", "text", true, false),
                    new("region", "text", false, false),
                    new("image_id", "text", false, true),
                    new("runtime_version", "text", false, true),
                }
            },
            new()
            {
                Name = "Custom",
                Description = "Blank template — define your own fields",
                IconName = "box",
                Fields = new List<TemplateField>()
            }
        };
    }

    private class AssetTypeTemplate
    {
        public string Name { get; set; } = "";
        public string? Description { get; set; }
        public string? IconName { get; set; }
        public List<TemplateField> Fields { get; set; } = [];
    }

    private record TemplateField(string Name, string DataType, bool IsRequired, bool IsCveSearchable, string? DefaultValue = null);
}
