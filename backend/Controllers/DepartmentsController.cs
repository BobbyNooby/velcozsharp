using backend.Data;
using backend.Models.Dtos;
using backend.Models.Entities;
using backend.Models.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DepartmentsController : TenantControllerBase
{
    public DepartmentsController(AppDbContext db, UserManager<AppUser> userManager)
        : base(db, userManager)
    {
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var departments = await _db.Departments
            .Select(d => new DepartmentResponse
            {
                Id = d.Id,
                Name = d.Name,
                IsActive = d.IsActive
            })
            .ToListAsync();

        return Ok(departments);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var department = await _db.Departments
            .Where(d => d.Id == id)
            .Select(d => new DepartmentResponse
            {
                Id = d.Id,
                Name = d.Name,
                IsActive = d.IsActive
            })
            .FirstOrDefaultAsync();

        if (department == null) return NotFound();
        return Ok(department);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateDepartmentRequest request)
    {
        var auth = await RequireOrgAdminAsync();
        if (auth != null) return auth;

        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var department = new Department
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            OrganizationId = orgId.Value,
            IsActive = true
        };

        _db.Departments.Add(department);
        await _db.SaveChangesAsync();

        return Ok(new DepartmentResponse
        {
            Id = department.Id,
            Name = department.Name,
            IsActive = department.IsActive
        });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDepartmentRequest request)
    {
        var auth = await RequireOrgAdminAsync();
        if (auth != null) return auth;

        var department = await _db.Departments.FirstOrDefaultAsync(d => d.Id == id);
        if (department == null) return NotFound();

        department.Name = request.Name;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var auth = await RequireOrgAdminAsync();
        if (auth != null) return auth;

        var department = await _db.Departments.FirstOrDefaultAsync(d => d.Id == id);
        if (department == null) return NotFound();

        department.IsActive = false;
        await _db.SaveChangesAsync();

        return NoContent();
    }
}
