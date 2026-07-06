using backend.Models.Entities;
using backend.Services;
using Microsoft.EntityFrameworkCore;

namespace backend.Data;

public class AppDbContext : DbContext
{
    private readonly ITenantContext _tenantContext;

    public Guid CurrentOrganizationId { get; set; }

    public DbSet<User> Users => Set<User>();
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<UserOrganization> UserOrganizations => Set<UserOrganization>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<AssetTypeDefinition> AssetTypeDefinitions => Set<AssetTypeDefinition>();
    public DbSet<AssetTypeField> AssetTypeFields => Set<AssetTypeField>();
    public DbSet<Asset> Assets => Set<Asset>();
    public DbSet<Vulnerability> Vulnerabilities => Set<Vulnerability>();
    public DbSet<AssetVulnerability> AssetVulnerabilities => Set<AssetVulnerability>();
    public DbSet<ScanJob> ScanJobs => Set<ScanJob>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    public AppDbContext(DbContextOptions<AppDbContext> options, ITenantContext? tenantContext = null)
        : base(options)
    {
        _tenantContext = tenantContext ?? new NullTenantContext();
        CurrentOrganizationId = _tenantContext.OrganizationId;
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Tenant isolation filters — only on entities with direct OrganizationId
        modelBuilder.Entity<Department>()
            .HasQueryFilter(d => d.OrganizationId == CurrentOrganizationId);

        modelBuilder.Entity<AssetTypeDefinition>()
            .HasQueryFilter(at => at.OrganizationId == CurrentOrganizationId);

        modelBuilder.Entity<Asset>()
            .HasQueryFilter(a => a.OrganizationId == CurrentOrganizationId);

        modelBuilder.Entity<AssetVulnerability>()
            .HasQueryFilter(av => av.OrganizationId == CurrentOrganizationId);

        modelBuilder.Entity<ScanJob>()
            .HasQueryFilter(sj => sj.OrganizationId == CurrentOrganizationId);

        modelBuilder.Entity<AuditLog>()
            .HasQueryFilter(al => al.OrganizationId == CurrentOrganizationId);

        // UserOrganization composite key
        modelBuilder.Entity<UserOrganization>()
            .HasKey(uo => new { uo.UserId, uo.OrganizationId });

        modelBuilder.Entity<UserOrganization>()
            .HasOne(uo => uo.User)
            .WithMany(u => u.Organizations)
            .HasForeignKey(uo => uo.UserId);

        modelBuilder.Entity<UserOrganization>()
            .HasOne(uo => uo.Organization)
            .WithMany(o => o.Users)
            .HasForeignKey(uo => uo.OrganizationId);

        // AssetVulnerability composite key
        modelBuilder.Entity<AssetVulnerability>()
            .HasKey(av => new { av.AssetId, av.VulnerabilityId });

        modelBuilder.Entity<AssetVulnerability>()
            .HasOne(av => av.Asset)
            .WithMany(a => a.Vulnerabilities)
            .HasForeignKey(av => av.AssetId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<AssetVulnerability>()
            .HasOne(av => av.Vulnerability)
            .WithMany(v => v.AssetVulnerabilities)
            .HasForeignKey(av => av.VulnerabilityId)
            .OnDelete(DeleteBehavior.Cascade);

        // AssetTypeField -> AssetTypeDefinition relationship
        modelBuilder.Entity<AssetTypeField>()
            .HasOne(f => f.AssetType)
            .WithMany(at => at.Fields)
            .HasForeignKey(f => f.AssetTypeId)
            .OnDelete(DeleteBehavior.Cascade);

        // Asset -> AssetTypeDefinition relationship
        modelBuilder.Entity<Asset>()
            .HasOne(a => a.AssetType)
            .WithMany(at => at.Assets)
            .HasForeignKey(a => a.AssetTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        // Asset -> Department relationship
        modelBuilder.Entity<Asset>()
            .HasOne(a => a.Department)
            .WithMany()
            .HasForeignKey(a => a.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);

        // Asset JSONB Properties
        modelBuilder.Entity<Asset>()
            .Property(a => a.Properties)
            .HasColumnType("jsonb");

        // ScanJob PostgreSQL array
        modelBuilder.Entity<ScanJob>()
            .Property(s => s.TargetAssetIds)
            .HasColumnType("uuid[]");

        // Unique indexes
        modelBuilder.Entity<User>()
            .HasIndex(u => u.Email)
            .IsUnique();

        modelBuilder.Entity<Vulnerability>()
            .HasIndex(v => v.CveId)
            .IsUnique();

        modelBuilder.Entity<Organization>()
            .HasIndex(o => o.Name);

        // Standard indexes for performance
        modelBuilder.Entity<Asset>()
            .HasIndex(a => a.OrganizationId);

        modelBuilder.Entity<Asset>()
            .HasIndex(a => a.DepartmentId);

        modelBuilder.Entity<Asset>()
            .HasIndex(a => a.AssetTypeId);

        modelBuilder.Entity<Asset>()
            .HasIndex(a => a.Status);

        modelBuilder.Entity<Asset>()
            .HasIndex(a => a.HighestSeverity);

        modelBuilder.Entity<AuditLog>()
            .HasIndex(a => new { a.OrganizationId, a.EntityType, a.Timestamp });
    }
}
