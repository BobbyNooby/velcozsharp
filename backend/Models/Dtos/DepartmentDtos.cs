namespace backend.Models.Dtos;

public class CreateDepartmentRequest
{
    public string Name { get; set; } = "";
}

public class UpdateDepartmentRequest
{
    public string Name { get; set; } = "";
}

public class DepartmentResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public bool IsActive { get; set; }
}
