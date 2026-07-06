namespace backend.Services;

public interface ITenantContext
{
    Guid OrganizationId { get; }
    Guid UserId { get; }
    string Role { get; }
}
