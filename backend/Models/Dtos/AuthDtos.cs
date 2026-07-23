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

public class UpdateProfileRequest
{
    public string? DisplayName { get; set; }
}

public class ChangePasswordRequest
{
    public string CurrentPassword { get; set; } = "";
    public string NewPassword { get; set; } = "";
}

public class ForgotPasswordRequest
{
    public string Email { get; set; } = "";
}

public class ResetPasswordRequest
{
    public string Email { get; set; } = "";
    public string Token { get; set; } = "";
    public string NewPassword { get; set; } = "";
}
