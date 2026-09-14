using backend.Models.Entities;
using backend.Models.Enums;
using backend.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace backend.Data;

public static class DevSeeder
{
    private const string BitforgeAdminEmail = "mia.chen@bitforge.dev";

    public static async Task SeedAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var templateService = scope.ServiceProvider.GetRequiredService<IAssetTypeTemplateService>();

        // Always ensure the platform admin exists, even on existing databases.
        var platformAdminUser = await userManager.FindByEmailAsync("host@velcozsharp.local");
        if (platformAdminUser == null)
        {
            platformAdminUser = new AppUser
            {
                Id = Guid.NewGuid(),
                UserName = "host@velcozsharp.local",
                Email = "host@velcozsharp.local",
                DisplayName = "Platform Admin",
                EmailConfirmed = true
            };

            var platformAdminResult = await userManager.CreateAsync(platformAdminUser, "password123");
            if (platformAdminResult.Succeeded)
            {
                await userManager.AddToRoleAsync(platformAdminUser, RoleNames.PlatformAdmin);
                Console.WriteLine($"🌱 Dev seeder: Created platform admin {platformAdminUser.Email} / password123");
            }
            else
            {
                Console.WriteLine($"   ❌ Failed to create platform admin: {string.Join(", ", platformAdminResult.Errors.Select(e => e.Description))}");
            }
        }

        // Only seed the Bitforge demo data if the org admin doesn't exist
        if (await userManager.Users.AnyAsync(u => u.Email == BitforgeAdminEmail))
        {
            Console.WriteLine("🌱 Dev seeder: Bitforge Labs data already exists, skipping.");
            return;
        }

        Console.WriteLine("🌱 Dev seeder: Seeding Bitforge Labs data...");

        // Create roles
        var roles = new[] { RoleNames.Admin, RoleNames.SecurityAnalyst, RoleNames.Viewer };
        foreach (var roleName in roles)
        {
            if (!await roleManager.RoleExistsAsync(roleName))
            {
                await roleManager.CreateAsync(new IdentityRole<Guid>(roleName));
            }
        }

        // Create the organization
        var bitforge = new Organization
        {
            Id = Guid.NewGuid(),
            Name = "Bitforge Labs",
            Description = "60-person B2B SaaS company — self-hosted dev toolchain with classic 'engineers patch prod, not tooling' hygiene"
        };
        db.Organizations.Add(bitforge);
        await db.SaveChangesAsync();

        // Tenant-scoped entities (asset types, departments, assets) carry a global
        // query filter on CurrentOrganizationId — set it or every read comes back empty.
        db.CurrentOrganizationId = bitforge.Id;

        await templateService.SeedBuiltInTypesAsync(bitforge.Id);
        Console.WriteLine("   Seeded built-in asset type templates (incl. Container Host, Backup Server)");

        // Departments
        var deptNames = new[] { "Engineering", "Platform", "Security", "Product", "People Ops", "Finance" };
        var depts = deptNames.ToDictionary(
            name => name,
            name => new Department { Id = Guid.NewGuid(), Name = name, OrganizationId = bitforge.Id });
        db.Departments.AddRange(depts.Values);
        await db.SaveChangesAsync();

        // Staff
        var staff = new (string Email, string Name, string Role)[]
        {
            new("mia.chen@bitforge.dev", "Mia Chen", RoleNames.Admin),              // CTO, owns the inventory
            new("priya.nair@bitforge.dev", "Priya Nair", RoleNames.Admin),          // Platform lead, runs the servers
            new("sofia.marsh@bitforge.dev", "Sofia Marsh", RoleNames.Admin),        // IT ops, laptops + joiners/leavers
            new("leo.park@bitforge.dev", "Leo Park", RoleNames.SecurityAnalyst),    // AppSec engineer, does triage
            new("sam.okafor@bitforge.dev", "Sam Okafor", RoleNames.Viewer),         // Backend engineer
            new("dave.kim@bitforge.dev", "Dave Kim", RoleNames.Viewer),             // Data engineer, insists MySQL/Redis are "internal"
            new("tom.becker@bitforge.dev", "Tom Becker", RoleNames.Viewer),         // Senior SRE, "we'll patch after launch" (3 years running)
            new("jules.moreau@bitforge.dev", "Jules Moreau", RoleNames.Viewer),     // Product manager, read-only
            new("yuki.tanaka@bitforge.dev", "Yuki Tanaka", RoleNames.Viewer),       // Engineering intern, week one
        };

        foreach (var person in staff)
        {
            var user = new AppUser
            {
                Id = Guid.NewGuid(),
                UserName = person.Email,
                Email = person.Email,
                DisplayName = person.Name,
                EmailConfirmed = true
            };

            var result = await userManager.CreateAsync(user, "password123");
            if (result.Succeeded)
            {
                await userManager.AddToRoleAsync(user, person.Role);

                db.UserOrganizations.Add(new UserOrganization
                {
                    Id = Guid.NewGuid(),
                    UserId = user.Id,
                    OrganizationId = bitforge.Id,
                    Role = person.Role,
                    IsDefault = true
                });

                Console.WriteLine($"   Created: {person.Email} ({person.Role})");
            }
            else
            {
                Console.WriteLine($"   ❌ Failed to create {person.Email}: {string.Join(", ", result.Errors.Select(e => e.Description))}");
            }
        }

        await db.SaveChangesAsync();

        // Resolve asset types created by the template service
        var types = await db.AssetTypeDefinitions
            .Where(t => t.OrganizationId == bitforge.Id && t.IsActive)
            .ToDictionaryAsync(t => t.Name, t => t.Id);

        Guid TypeId(string name) => types.TryGetValue(name, out var id)
            ? id
            : throw new InvalidOperationException($"Asset type '{name}' not found for {bitforge.Name}");

        var laptop = TypeId("Laptop / Workstation");
        var server = TypeId("Server");
        var networkDevice = TypeId("Network Device");
        var software = TypeId("Software / Application");
        var database = TypeId("Database");
        var webApp = TypeId("Web Application");
        var iot = TypeId("Smart Device / IoT");
        var containerHost = TypeId("Container Host");
        var backupServer = TypeId("Backup Server");

        var assets = new List<Asset>
        {
            // --- Healthy baseline: current, patched, boring on purpose ---
            new()
            {
                Id = Guid.NewGuid(), Name = "mia-macbook-pro", OrganizationId = bitforge.Id,
                AssetTypeId = laptop, DepartmentId = depts["Engineering"].Id, Criticality = AssetCriticality.Medium,
                Description = "CTO's daily driver",
                Properties = new Dictionary<string, object>
                {
                    ["hostname"] = "mia-mbp", ["operating_system"] = "macOS", ["os_version"] = "14.5",
                    ["model"] = "MacBook Pro 14\" M3", ["serial_number"] = "BTF-MBP-001",
                    ["assigned_user"] = "mia.chen@bitforge.dev"
                }
            },
            new()
            {
                Id = Guid.NewGuid(), Name = "leo-thinkpad", OrganizationId = bitforge.Id,
                AssetTypeId = laptop, DepartmentId = depts["Security"].Id, Criticality = AssetCriticality.Medium,
                Description = "AppSec workstation",
                Properties = new Dictionary<string, object>
                {
                    ["hostname"] = "leo-x1", ["operating_system"] = "Windows", ["os_version"] = "11 23H2",
                    ["model"] = "ThinkPad X1 Carbon", ["serial_number"] = "BTF-TP-014",
                    ["assigned_user"] = "leo.park@bitforge.dev"
                }
            },

            // --- End-user dust ---
            new()
            {
                Id = Guid.NewGuid(), Name = "qa-loaner-laptop", OrganizationId = bitforge.Id,
                AssetTypeId = laptop, DepartmentId = depts["Engineering"].Id, Criticality = AssetCriticality.Low,
                Description = "Forgotten loaner-drawer laptop, OS branch EOL since 2023",
                Tags = new List<string> { "eol" },
                Properties = new Dictionary<string, object>
                {
                    ["hostname"] = "qa-loaner", ["operating_system"] = "Windows", ["os_version"] = "10 20H2",
                    ["model"] = "Dell Latitude 5400", ["serial_number"] = "BTF-LAT-073",
                    ["assigned_user"] = "shared"
                }
            },

            // --- Self-hosted dev toolchain: the real crown jewels, all stale ---
            new()
            {
                Id = Guid.NewGuid(), Name = "gitlab-ce", OrganizationId = bitforge.Id,
                AssetTypeId = software, DepartmentId = depts["Platform"].Id, Criticality = AssetCriticality.High,
                Description = "Source control — nobody wants to do the 13→16 upgrade migration",
                Tags = new List<string> { "self-hosted" },
                Properties = new Dictionary<string, object>
                {
                    ["application_name"] = "GitLab CE", ["version"] = "13.12.15", ["vendor"] = "GitLab",
                    ["deployment_url"] = "https://gitlab.bitforge.internal",
                    ["license_type"] = "MIT", ["installation_path"] = "/opt/gitlab"
                }
            },
            new()
            {
                Id = Guid.NewGuid(), Name = "jenkins-ci", OrganizationId = bitforge.Id,
                AssetTypeId = software, DepartmentId = depts["Platform"].Id, Criticality = AssetCriticality.High,
                Description = "CI/CD — years of unpatched plugins on top of the core CVEs",
                Tags = new List<string> { "ci-cd" },
                Properties = new Dictionary<string, object>
                {
                    ["application_name"] = "Jenkins", ["version"] = "2.289.3 LTS", ["vendor"] = "Jenkins",
                    ["deployment_url"] = "https://jenkins.bitforge.internal",
                    ["installation_path"] = "/var/lib/jenkins"
                }
            },
            new()
            {
                Id = Guid.NewGuid(), Name = "confluence-wiki", OrganizationId = bitforge.Id,
                AssetTypeId = software, DepartmentId = depts["Platform"].Id, Criticality = AssetCriticality.Critical,
                Description = "Two separate unauthenticated RCEs (CVE-2022-26134, CVE-2023-22527)",
                Tags = new List<string> { "internet-facing", "kev" },
                Properties = new Dictionary<string, object>
                {
                    ["application_name"] = "Confluence Data Center", ["version"] = "7.13.6", ["vendor"] = "Atlassian",
                    ["deployment_url"] = "https://wiki.bitforge.internal",
                    ["license_type"] = "Commercial"
                }
            },
            new()
            {
                Id = Guid.NewGuid(), Name = "grafana-metrics", OrganizationId = bitforge.Id,
                AssetTypeId = software, DepartmentId = depts["Platform"].Id, Criticality = AssetCriticality.High,
                Description = "Metrics dashboards, path traversal CVE-2021-43798",
                Properties = new Dictionary<string, object>
                {
                    ["application_name"] = "Grafana", ["version"] = "7.5.5", ["vendor"] = "Grafana Labs",
                    ["deployment_url"] = "https://metrics.bitforge.internal"
                }
            },
            new()
            {
                Id = Guid.NewGuid(), Name = "nexus-repository", OrganizationId = bitforge.Id,
                AssetTypeId = software, DepartmentId = depts["Platform"].Id, Criticality = AssetCriticality.High,
                Description = "Artifact store, deserialization RCE CVE-2020-11478",
                Properties = new Dictionary<string, object>
                {
                    ["application_name"] = "Nexus Repository OSS", ["version"] = "3.21.2", ["vendor"] = "Sonatype",
                    ["deployment_url"] = "https://nexus.bitforge.internal"
                }
            },

            // --- Data tier: "it's internal, who cares" ---
            new()
            {
                Id = Guid.NewGuid(), Name = "staging-mysql", OrganizationId = bitforge.Id,
                AssetTypeId = database, DepartmentId = depts["Engineering"].Id, Criticality = AssetCriticality.Medium,
                Description = "EOL since 2021 — no patch path, must be rebuilt",
                Tags = new List<string> { "eol" },
                Properties = new Dictionary<string, object>
                {
                    ["database_name"] = "staging_db", ["dbms_type"] = "MySQL", ["version"] = "5.6.51",
                    ["host"] = "db-staging-01", ["port"] = 3306, ["instance_name"] = "staging"
                }
            },
            new()
            {
                Id = Guid.NewGuid(), Name = "redis-dev-cache", OrganizationId = bitforge.Id,
                AssetTypeId = database, DepartmentId = depts["Engineering"].Id, Criticality = AssetCriticality.High,
                Description = "Unauthenticated on :6379 — CVE-2022-0543 Lua sandbox escape",
                Tags = new List<string> { "no-auth" },
                Properties = new Dictionary<string, object>
                {
                    ["database_name"] = "dev-cache", ["dbms_type"] = "Redis", ["version"] = "4.0.9",
                    ["host"] = "redis-dev-01", ["port"] = 6379
                }
            },
            new()
            {
                Id = Guid.NewGuid(), Name = "legacy-wiki-v1", OrganizationId = bitforge.Id,
                AssetTypeId = webApp, DepartmentId = depts["Engineering"].Id, Criticality = AssetCriticality.Low,
                Description = "Nobody owns this. WordPress 5.3 on EOL PHP 7.2",
                Tags = new List<string> { "eol", "abandoned" },
                Properties = new Dictionary<string, object>
                {
                    ["app_name"] = "Legacy Wiki v1", ["url"] = "http://wiki-old.bitforge.internal",
                    ["framework"] = "WordPress", ["framework_version"] = "5.3.2",
                    ["language"] = "PHP", ["language_version"] = "7.2.24"
                }
            },

            // --- Infrastructure: forgotten on purpose ---
            new()
            {
                Id = Guid.NewGuid(), Name = "staging-k8s-node-01", OrganizationId = bitforge.Id,
                AssetTypeId = containerHost, DepartmentId = depts["Platform"].Id, Criticality = AssetCriticality.High,
                Description = "Staging cluster node, two Kubernetes releases off support",
                Properties = new Dictionary<string, object>
                {
                    ["hostname"] = "k8s-stg-01", ["operating_system"] = "Ubuntu", ["os_version"] = "20.04.6",
                    ["kubernetes_version"] = "1.21.2", ["container_runtime"] = "containerd 1.4.3"
                }
            },
            new()
            {
                Id = Guid.NewGuid(), Name = "office-dc-01", OrganizationId = bitforge.Id,
                AssetTypeId = server, DepartmentId = depts["Platform"].Id, Criticality = AssetCriticality.Critical,
                Description = "Zerologon (CVE-2020-1472) — worst box in the company, nobody remembers provisioning it",
                Tags = new List<string> { "kev", "eol" },
                Properties = new Dictionary<string, object>
                {
                    ["hostname"] = "office-dc-01", ["operating_system"] = "Windows Server", ["os_version"] = "2012 R2",
                    ["ip_address"] = "192.168.1.10"
                }
            },
            new()
            {
                Id = Guid.NewGuid(), Name = "hq-firewall", OrganizationId = bitforge.Id,
                AssetTypeId = networkDevice, DepartmentId = depts["Platform"].Id, Criticality = AssetCriticality.Critical,
                Description = "Internet-facing edge, two generations behind — SSL VPN RCEs (CVE-2023-27997, CVE-2024-21762)",
                Tags = new List<string> { "internet-facing", "kev" },
                Properties = new Dictionary<string, object>
                {
                    ["hostname"] = "hq-firewall", ["device_model"] = "FortiGate 60F", ["vendor"] = "Fortinet",
                    ["firmware_version"] = "FortiOS 6.4.5", ["ip_address"] = "203.0.113.10"
                }
            },
            new()
            {
                Id = Guid.NewGuid(), Name = "backup-server-01", OrganizationId = bitforge.Id,
                AssetTypeId = backupServer, DepartmentId = depts["Platform"].Id, Criticality = AssetCriticality.Critical,
                Description = "Credential disclosure CVE-2023-27532 — the ransomware entry point",
                Tags = new List<string> { "ransomware-target" },
                Properties = new Dictionary<string, object>
                {
                    ["hostname"] = "backup-01", ["operating_system"] = "Windows Server", ["os_version"] = "2019 Standard",
                    ["backup_software"] = "Veeam Backup & Replication", ["backup_software_version"] = "11a (11.0.1)"
                }
            },
            new()
            {
                Id = Guid.NewGuid(), Name = "dev-nas", OrganizationId = bitforge.Id,
                AssetTypeId = iot, DepartmentId = depts["Engineering"].Id, Criticality = AssetCriticality.Medium,
                Description = "Office closet NAS — exact Qlocker ransomware target profile",
                Tags = new List<string> { "qlocker-profile" },
                Properties = new Dictionary<string, object>
                {
                    ["device_name"] = "dev-nas", ["model"] = "TS-451+", ["vendor"] = "QNAP",
                    ["firmware_version"] = "QTS 4.3.6", ["protocol"] = "SMB/NFS", ["ip_address"] = "192.168.1.50"
                }
            },
            new()
            {
                Id = Guid.NewGuid(), Name = "office-router", OrganizationId = bitforge.Id,
                AssetTypeId = networkDevice, DepartmentId = depts["Platform"].Id, Criticality = AssetCriticality.Medium,
                Description = "Office edge router, 2021-era firmware",
                Properties = new Dictionary<string, object>
                {
                    ["hostname"] = "office-router", ["device_model"] = "UniFi Dream Machine Pro", ["vendor"] = "Ubiquiti",
                    ["firmware_version"] = "UniFi OS 1.1.3", ["ip_address"] = "192.168.1.1"
                }
            },
        };

        db.Assets.AddRange(assets);
        await db.SaveChangesAsync();

        Console.WriteLine($"🌱 Dev seeder: Done! Created {bitforge.Name} with {staff.Length} users and {assets.Count} assets.");
        Console.WriteLine("   Login with any account + password: password123");
        Console.WriteLine("   Org admin: mia.chen@bitforge.dev / Analyst: leo.park@bitforge.dev");
        Console.WriteLine("   Platform admin login: host@velcozsharp.local / password123");
    }
}
