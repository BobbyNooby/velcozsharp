using backend.Data;
using backend.Models.Entities;
using backend.Models.Enums;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

[ApiController]
[Route("api/seed")]
[Authorize]
public class SeedController : TenantControllerBase
{
    private readonly IAssetTypeTemplateService _templateService;
    private readonly ILogger<SeedController> _logger;

    public SeedController(
        AppDbContext db,
        UserManager<AppUser> userManager,
        IAssetTypeTemplateService templateService,
        ILogger<SeedController> logger)
        : base(db, userManager)
    {
        _templateService = templateService;
        _logger = logger;
    }

    [HttpPost("demo-assets")]
    public async Task<IActionResult> SeedDemoAssets()
    {
        var auth = await RequireOrgAdminAsync();
        if (auth != null) return auth;

        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        _db.CurrentOrganizationId = orgId.Value;

        // Ensure templates exist
        await _templateService.SeedBuiltInTypesAsync(orgId.Value);

        // Get departments and asset types
        var depts = await _db.Departments.Where(d => d.IsActive).ToListAsync();
        if (depts.Count == 0)
        {
            // Create default departments if none exist
            var itDept = new Department { Id = Guid.NewGuid(), Name = "IT", OrganizationId = orgId.Value, IsActive = true };
            var secDept = new Department { Id = Guid.NewGuid(), Name = "Security", OrganizationId = orgId.Value, IsActive = true };
            _db.Departments.AddRange(itDept, secDept);
            await _db.SaveChangesAsync();
            depts = new List<Department> { itDept, secDept };
        }

        var types = await _db.AssetTypeDefinitions.Where(at => at.IsActive).ToListAsync();

        // Find specific types
        var serverType = types.FirstOrDefault(t => t.Name == "Server");
        var laptopType = types.FirstOrDefault(t => t.Name == "Laptop / Workstation");
        var netType = types.FirstOrDefault(t => t.Name == "Network Device");
        var softwareType = types.FirstOrDefault(t => t.Name == "Software / Application");
        var dbType = types.FirstOrDefault(t => t.Name == "Database");

        var createdAssets = new List<Asset>();

        if (serverType != null)
        {
            createdAssets.Add(new Asset
            {
                Id = Guid.NewGuid(),
                Name = "web-prod-01",
                Description = "Production web server",
                OrganizationId = orgId.Value,
                AssetTypeId = serverType.Id,
                DepartmentId = depts[0].Id,
                Status = AssetStatus.Active,
                Properties = new Dictionary<string, object>
                {
                    ["hostname"] = "web-prod-01",
                    ["operating_system"] = "Ubuntu",
                    ["os_version"] = "22.04",
                    ["kernel_version"] = "5.15.0",
                    ["ip_address"] = "10.0.1.10",
                    ["cpu_cores"] = 8,
                    ["memory_gb"] = 32
                },
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });

            createdAssets.Add(new Asset
            {
                Id = Guid.NewGuid(),
                Name = "db-master-01",
                Description = "Primary database server",
                OrganizationId = orgId.Value,
                AssetTypeId = serverType.Id,
                DepartmentId = depts[0].Id,
                Status = AssetStatus.Active,
                Properties = new Dictionary<string, object>
                {
                    ["hostname"] = "db-master-01",
                    ["operating_system"] = "CentOS",
                    ["os_version"] = "7.9",
                    ["kernel_version"] = "3.10.0",
                    ["ip_address"] = "10.0.1.20",
                    ["cpu_cores"] = 16,
                    ["memory_gb"] = 64
                },
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
        }

        if (laptopType != null)
        {
            createdAssets.Add(new Asset
            {
                Id = Guid.NewGuid(),
                Name = "emily-laptop",
                Description = "Emily's work laptop",
                OrganizationId = orgId.Value,
                AssetTypeId = laptopType.Id,
                DepartmentId = depts[0].Id,
                Status = AssetStatus.Active,
                Properties = new Dictionary<string, object>
                {
                    ["hostname"] = "emily-laptop",
                    ["operating_system"] = "Windows",
                    ["os_version"] = "11",
                    ["model"] = "Dell XPS 15",
                    ["serial_number"] = "ABC123456",
                    ["assigned_user"] = "emily@test.com"
                },
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
        }

        if (netType != null)
        {
            createdAssets.Add(new Asset
            {
                Id = Guid.NewGuid(),
                Name = "core-router-01",
                Description = "Core network router",
                OrganizationId = orgId.Value,
                AssetTypeId = netType.Id,
                DepartmentId = depts[0].Id,
                Status = AssetStatus.Active,
                Properties = new Dictionary<string, object>
                {
                    ["hostname"] = "core-router-01",
                    ["device_model"] = "Cisco ISR 4431",
                    ["vendor"] = "Cisco",
                    ["firmware_version"] = "16.12.4",
                    ["ip_address"] = "10.0.0.1",
                    ["mac_address"] = "00:1A:2B:3C:4D:5E"
                },
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
        }

        if (softwareType != null)
        {
            createdAssets.Add(new Asset
            {
                Id = Guid.NewGuid(),
                Name = "webapp-frontend",
                Description = "Customer facing web application",
                OrganizationId = orgId.Value,
                AssetTypeId = softwareType.Id,
                DepartmentId = depts[0].Id,
                Status = AssetStatus.Active,
                Properties = new Dictionary<string, object>
                {
                    ["application_name"] = "Next.js App",
                    ["version"] = "14.2.0",
                    ["vendor"] = "Vercel",
                    ["deployment_url"] = "https://app.example.com",
                    ["license_type"] = "MIT",
                    ["installation_path"] = "/var/www/app"
                },
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });

            createdAssets.Add(new Asset
            {
                Id = Guid.NewGuid(),
                Name = "legacy-java-service",
                Description = "Internal billing service",
                OrganizationId = orgId.Value,
                AssetTypeId = softwareType.Id,
                DepartmentId = depts[0].Id,
                Status = AssetStatus.Active,
                Properties = new Dictionary<string, object>
                {
                    ["application_name"] = "Billing Service",
                    ["version"] = "8.0.1",
                    ["vendor"] = "Oracle",
                    ["deployment_url"] = "https://billing.internal",
                    ["license_type"] = "Commercial",
                    ["installation_path"] = "/opt/billing"
                },
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
        }

        if (dbType != null)
        {
            createdAssets.Add(new Asset
            {
                Id = Guid.NewGuid(),
                Name = "postgres-main",
                Description = "Main PostgreSQL instance",
                OrganizationId = orgId.Value,
                AssetTypeId = dbType.Id,
                DepartmentId = depts[0].Id,
                Status = AssetStatus.Active,
                Properties = new Dictionary<string, object>
                {
                    ["database_name"] = "prod_db",
                    ["dbms_type"] = "PostgreSQL",
                    ["version"] = "15.4",
                    ["host"] = "db-master-01",
                    ["port"] = 5432,
                    ["instance_name"] = "main"
                },
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
        }

        if (createdAssets.Count > 0)
        {
            _db.Assets.AddRange(createdAssets);
            await _db.SaveChangesAsync();
        }

        return Ok(new
        {
            message = $"Created {createdAssets.Count} demo assets",
            assets = createdAssets.Select(a => new { a.Id, a.Name, a.AssetTypeId })
        });
    }
}
