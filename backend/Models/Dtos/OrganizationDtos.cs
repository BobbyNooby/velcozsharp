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
    public int AiChunkSize { get; set; } = 50;
    public int? AiMaxCvesPerAsset { get; set; }
    public int AiMinScore { get; set; } = 0;
}

public class OrganizationResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsActive { get; set; }
    public bool IsAiEnabled { get; set; }
    public int AiChunkSize { get; set; }
    public int? AiMaxCvesPerAsset { get; set; }
    public int AiMinScore { get; set; }
    public DateTime CreatedAt { get; set; }
}
