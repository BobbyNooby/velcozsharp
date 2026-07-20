using System.Diagnostics;

namespace backend.Infrastructure.Middleware;

public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();
        var method = context.Request.Method;
        var path = context.Request.Path;
        var traceId = context.TraceIdentifier;

        _logger.LogInformation("[{TraceId}] {Method} {Path} started", traceId, method, path);

        try
        {
            await _next(context);
        }
        finally
        {
            stopwatch.Stop();
            var statusCode = context.Response.StatusCode;
            _logger.LogInformation(
                "[{TraceId}] {Method} {Path} completed {StatusCode} in {ElapsedMs}ms",
                traceId, method, path, statusCode, stopwatch.ElapsedMilliseconds);
        }
    }
}
