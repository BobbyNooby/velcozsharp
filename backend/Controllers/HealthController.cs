using backend.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<HealthController> _logger;

    public HealthController(AppDbContext db, ILogger<HealthController> logger)
    {
        _db = db;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var checks = new Dictionary<string, object>();
        var healthy = true;

        try
        {
            var dbHealthy = await _db.Database.CanConnectAsync();
            checks["database"] = dbHealthy ? "healthy" : "unhealthy";
            if (!dbHealthy) healthy = false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Health check failed for database");
            checks["database"] = "unhealthy";
            healthy = false;
        }

        checks["timestamp"] = DateTime.UtcNow;

        return healthy
            ? Ok(new { status = "healthy", checks })
            : StatusCode(503, new { status = "unhealthy", checks });
    }
}
