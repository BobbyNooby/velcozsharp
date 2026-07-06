namespace backend.Services;

public class NullTenantContext : ITenantContext
{
    public Guid OrganizationId => Guid.Empty;
    public Guid UserId => Guid.Empty;
    public string Role => string.Empty;
}
