namespace backend.Models.Entities;

public class Department
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
}
