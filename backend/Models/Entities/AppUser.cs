using Microsoft.AspNetCore.Identity;

namespace backend.Models.Entities;

public class AppUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = "";
    public Guid? OrganizationId { get; set; }  // Legacy: deprecated, use UserOrganizations
    public Organization? Organization { get; set; }
}
