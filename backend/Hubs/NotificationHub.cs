using backend.Data;
using backend.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace backend.Hubs;

[Authorize]
public class NotificationHub : Hub
{
    private readonly UserManager<AppUser> _userManager;
    private readonly AppDbContext _db;

    public NotificationHub(UserManager<AppUser> userManager, AppDbContext db)
    {
        _userManager = userManager;
        _db = db;
    }

    public async Task JoinOrganization(string organizationId)
    {
        if (!Guid.TryParse(organizationId, out var orgId))
        {
            throw new HubException("Invalid organization id");
        }

        var userIdString = _userManager.GetUserId(Context.User);
        if (string.IsNullOrEmpty(userIdString) || !Guid.TryParse(userIdString, out var userId))
        {
            throw new HubException("Not authenticated");
        }

        var isMember = await _db.UserOrganizations
            .AnyAsync(uo => uo.UserId == userId && uo.OrganizationId == orgId);

        if (!isMember)
        {
            throw new HubException("Not a member of this organization");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, orgId.ToString());
    }

    public async Task LeaveOrganization(string organizationId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, organizationId);
    }
}
