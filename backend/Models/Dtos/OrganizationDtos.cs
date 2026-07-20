namespace backend.Models.Dtos;

public class CreateOrganizationRequest
{
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? NvdApiKey { get; set; }
    public bool IsAiEnabled { get; set; } = false;
}

public class UpdateOrganizationRequest
{
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? NvdApiKey { get; set; }
    public bool IsAiEnabled { get; set; } = false;
}

public class OrganizationResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsActive { get; set; }
    public bool IsAiEnabled { get; set; }
    public DateTime CreatedAt { get; set; }
}
