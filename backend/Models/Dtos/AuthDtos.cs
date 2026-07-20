using backend.Models.Enums;

namespace backend.Models.Dtos;

public class LoginRequest
{
    public string Email { get; set; } = "";
    public string Password { get; set; } = "";
}

public class RegisterRequest
{
    public string Email { get; set; } = "";
    public string Password { get; set; } = "";
    public string? DisplayName { get; set; }
}

public class InviteUserRequest
{
    public string Email { get; set; } = "";
    public string Role { get; set; } = RoleNames.Viewer;
}

public class UpdateUserRoleRequest
{
    public string Role { get; set; } = "";
}
