namespace backend.Models.Entities;

public class UserOrganization
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    public bool IsDefault { get; set; } = false;
}
