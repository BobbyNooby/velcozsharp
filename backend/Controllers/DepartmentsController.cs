using backend.Data;
using backend.Infrastructure.Pagination;
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
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] bool? includeInactive,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortOrder,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        var query = _db.Departments.AsQueryable();

        if (!includeInactive.HasValue || !includeInactive.Value)
            query = query.Where(d => d.IsActive);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(d => d.Name.ToLower().Contains(term));
        }

        var descending = sortOrder?.ToLower() != "asc";
        query = sortBy?.ToLower() switch
        {
            "name" => descending ? query.OrderByDescending(d => d.Name) : query.OrderBy(d => d.Name),
            _ => query.OrderBy(d => d.Name)
        };

        var result = await query
            .Select(d => new DepartmentResponse
            {
                Id = d.Id,
                Name = d.Name,
                IsActive = d.IsActive
            })
            .ToPagedResultAsync(page, pageSize);

        return Ok(result);
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

    [HttpPost("{id:guid}/reactivate")]
    public async Task<IActionResult> Reactivate(Guid id)
    {
        var auth = await RequireOrgAdminAsync();
        if (auth != null) return auth;

        var orgId = await GetCurrentOrgIdAsync();
        if (!orgId.HasValue) return Forbid();

        var department = await _db.Departments
            .FirstOrDefaultAsync(d => d.Id == id && d.OrganizationId == orgId.Value);
        if (department == null) return NotFound();

        if (department.IsActive)
            return BadRequest(new { message = "Department is already active." });

        department.IsActive = true;
        await _db.SaveChangesAsync();

        return Ok(new DepartmentResponse
        {
            Id = department.Id,
            Name = department.Name,
            IsActive = department.IsActive
        });
    }
}
