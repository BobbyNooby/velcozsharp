namespace backend.Models.Dtos;

public class PlatformStatsResponse
{
    public int OrganizationCount { get; set; }
    public int UserCount { get; set; }
    public int TotalAssetCount { get; set; }
    public int TotalVulnerabilityCount { get; set; }
    public int ActiveScanJobCount { get; set; }
    public bool DatabaseHealthy { get; set; }
}

public class PlatformOrganizationResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public int UserCount { get; set; }
    public int AssetCount { get; set; }
}

public class PlatformUserResponse
{
    public Guid Id { get; set; }
    public string Email { get; set; } = "";
    public string? DisplayName { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsLockedOut { get; set; }
    public List<PlatformUserOrganizationMembership> Organizations { get; set; } = [];
}

public class PlatformUserOrganizationMembership
{
    public Guid OrganizationId { get; set; }
    public string OrganizationName { get; set; } = "";
    public string Role { get; set; } = "";
}

public class UpdateOrganizationActiveRequest
{
    public bool IsActive { get; set; }
}

public class ResetUserPasswordResponse
{
    public string NewPassword { get; set; } = "";
}
