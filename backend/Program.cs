using backend.Data;
using backend.Hubs;
using backend.Infrastructure.Middleware;
using backend.Models.Entities;
using backend.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddOpenApi();

// Identity
builder.Services.AddIdentity<AppUser, IdentityRole<Guid>>(options =>
{
    options.Password.RequireDigit = false;
    options.Password.RequireLowercase = false;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequireUppercase = false;
    options.Password.RequiredLength = 6;
    options.User.RequireUniqueEmail = true;
})
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders()
    .AddClaimsPrincipalFactory<AppUserClaimsPrincipalFactory>();

// Cookie auth config
builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "velcoz_auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = CookieSecurePolicy.None; // dev only
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.Domain = "localhost"; // domain cookie: shared across ports
    options.ExpireTimeSpan = TimeSpan.FromHours(24);
    options.SlidingExpiration = true;

    // Return 401 for API requests instead of redirecting to login page
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = 401;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = 403;
        return Task.CompletedTask;
    };
});

builder.Services.AddAuthorization();
builder.Services.AddProblemDetails();

// CORS for dev
builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", policy =>
    {
        policy.WithOrigins(
                  "http://localhost:3000",
                  "http://127.0.0.1:3000"
              )
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// DbContext with PostgreSQL + dynamic JSONB support for Dictionary<string, object>
var dataSourceBuilder = new NpgsqlDataSourceBuilder(builder.Configuration.GetConnectionString("DefaultConnection"));
dataSourceBuilder.EnableDynamicJson();
var dataSource = dataSourceBuilder.Build();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(
        dataSource,
        npgsqlOptions => npgsqlOptions.MigrationsAssembly("backend")
    )
);

// Tenant context
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantContext, CurrentUserContext>();

// Validation services
builder.Services.AddScoped<IAssetValidationService, AssetValidationService>();
builder.Services.AddScoped<IAssetTypeTemplateService, AssetTypeTemplateService>();

// NVD / Scan services
builder.Services.AddHttpClient<INvdApiService, NvdApiService>();
builder.Services.AddScoped<ICveMappingService, RegexCveMappingService>();
builder.Services.AddScoped<IAiCveMappingService, AiCveMappingService>();

// Audit logging
builder.Services.AddScoped<IAuditLogService, AuditLogService>();

// Notifications
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddSingleton<IScanJobCancellationService, ScanJobCancellationService>();
builder.Services.AddSignalR();

// AI / OpenRouter
builder.Services.AddHttpClient<IOpenRouterService, OpenRouterService>();

// Background worker for async scan jobs
builder.Services.AddHostedService<BackgroundScanWorker>();

// Controllers
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });

var app = builder.Build();

// Test database connection + seed on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    try
    {
        var canConnect = await db.Database.CanConnectAsync();
        Console.WriteLine(canConnect
            ? "✅ Database connection successful: PostgreSQL is reachable."
            : "❌ Database connection failed: CanConnect returned false.");

        if (canConnect)
        {
            // Ensure the system-level PlatformAdmin role exists in Identity.
            // This is separate from org-scoped roles (Admin/SecurityAnalyst/Viewer).
            var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
            if (!await roleManager.RoleExistsAsync(backend.Models.Enums.RoleNames.PlatformAdmin))
            {
                await roleManager.CreateAsync(new IdentityRole<Guid>(backend.Models.Enums.RoleNames.PlatformAdmin));
                Console.WriteLine("✅ PlatformAdmin role ensured.");
            }

            if (app.Environment.IsDevelopment())
            {
                await DevSeeder.SeedAsync(app.Services);
            }
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"❌ Database connection error: {ex.Message}");
    }
}

// Email infrastructure stub note:
// This project does not include an IEmailSender implementation. Password resets
// are handled by platform admins via /api/platform/users/{userId}/reset-password.
// To enable email-based flows (forgot password, email confirmation), register an
// IEmailSender implementation such as SmtpEmailSender or SendGridEmailSender here.

// Configure the HTTP request pipeline.
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<RequestLoggingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("DevCors");

app.UseAuthentication();
app.UseAuthorization();

app.UseHttpsRedirection();

app.MapControllers();
app.MapHub<NotificationHub>("hubs/notifications");

app.Run();
