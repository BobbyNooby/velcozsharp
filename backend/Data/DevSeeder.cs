using backend.Models.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace backend.Data;

public static class DevSeeder
{
    public static async Task SeedAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Only seed if admin doesn't exist
        if (await userManager.Users.AnyAsync(u => u.Email == "admin@test.com"))
        {
            Console.WriteLine("🌱 Dev seeder: Data already exists, skipping.");
            return;
        }

        Console.WriteLine("🌱 Dev seeder: Seeding fake data...");

        // Create roles
        var roles = new[] { "Admin", "SecurityAnalyst", "Viewer" };
        foreach (var roleName in roles)
        {
            if (!await roleManager.RoleExistsAsync(roleName))
            {
                await roleManager.CreateAsync(new IdentityRole<Guid>(roleName));
            }
        }

        // Create organizations
        var orgs = new[]
        {
            new Organization { Id = Guid.NewGuid(), Name = "Acme Corp", Description = "Primary development sandbox" },
            new Organization { Id = Guid.NewGuid(), Name = "Beta LLC", Description = "Secondary test org" }
        };
        db.Organizations.AddRange(orgs);
        await db.SaveChangesAsync();

        // Create fake users with multi-org memberships
        var fakeUsers = new[]
        {
            new { Email = "admin@test.com", Name = "Admin User", Role = "Admin" },
            new { Email = "analyst@test.com", Name = "Analyst User", Role = "SecurityAnalyst" },
            new { Email = "viewer@test.com", Name = "Viewer User", Role = "Viewer" }
        };

        foreach (var fake in fakeUsers)
        {
            var user = new AppUser
            {
                Id = Guid.NewGuid(),
                UserName = fake.Email,
                Email = fake.Email,
                DisplayName = fake.Name,
                OrganizationId = orgs[0].Id, // Legacy: default to first org
                EmailConfirmed = true
            };

            var result = await userManager.CreateAsync(user, "password123");
            if (result.Succeeded)
            {
                await userManager.AddToRoleAsync(user, fake.Role);

                // Add membership to both orgs
                db.UserOrganizations.AddRange(
                    new UserOrganization
                    {
                        Id = Guid.NewGuid(),
                        UserId = user.Id,
                        OrganizationId = orgs[0].Id,
                        Role = fake.Role,
                        IsDefault = true
                    },
                    new UserOrganization
                    {
                        Id = Guid.NewGuid(),
                        UserId = user.Id,
                        OrganizationId = orgs[1].Id,
                        Role = "Viewer", // Secondary org always Viewer for simplicity
                        IsDefault = false
                    }
                );

                Console.WriteLine($"   Created: {fake.Email} ({fake.Role}) — member of {orgs[0].Name} + {orgs[1].Name}");
            }
            else
            {
                Console.WriteLine($"   ❌ Failed to create {fake.Email}: {string.Join(", ", result.Errors.Select(e => e.Description))}");
            }
        }

        await db.SaveChangesAsync();

        // Seed departments for each org
        foreach (var org in orgs)
        {
            db.Departments.AddRange(
                new Department { Id = Guid.NewGuid(), Name = "IT", OrganizationId = org.Id },
                new Department { Id = Guid.NewGuid(), Name = "Security", OrganizationId = org.Id },
                new Department { Id = Guid.NewGuid(), Name = "HR", OrganizationId = org.Id }
            );
        }
        await db.SaveChangesAsync();

        Console.WriteLine("🌱 Dev seeder: Done!");
        Console.WriteLine("   Login with any account + password: password123");
        Console.WriteLine("   Use X-Organization-Id header to scope requests to an org");
    }
}
