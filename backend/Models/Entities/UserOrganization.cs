namespace backend.Models.Entities;

public class UserOrganization
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;

    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    public string Role { get; set; } = "Viewer";
    public bool IsDefault { get; set; } = false;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
