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

        // Create organization
        var org = new Organization
        {
            Id = Guid.NewGuid(),
            Name = "Demo Corp",
            Description = "Development sandbox organization"
        };
        db.Organizations.Add(org);
        await db.SaveChangesAsync();

        // Create fake users
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
                OrganizationId = org.Id,
                EmailConfirmed = true
            };

            var result = await userManager.CreateAsync(user, "password123");
            if (result.Succeeded)
            {
                await userManager.AddToRoleAsync(user, fake.Role);
                Console.WriteLine($"   Created: {fake.Email} ({fake.Role})");
            }
            else
            {
                Console.WriteLine($"   ❌ Failed to create {fake.Email}: {string.Join(", ", result.Errors.Select(e => e.Description))}");
            }
        }

        Console.WriteLine("🌱 Dev seeder: Done!");
        Console.WriteLine("   Login with any account + password: password123");
    }
}
