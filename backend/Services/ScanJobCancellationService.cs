namespace backend.Services;

public interface IScanJobCancellationService
{
    void RegisterJob(Guid jobId, CancellationTokenSource cts);
    void UnregisterJob(Guid jobId);
    bool CancelJob(Guid jobId);
}

public class ScanJobCancellationService : IScanJobCancellationService
{
    private readonly Dictionary<Guid, CancellationTokenSource> _tokens = new();
    private readonly object _lock = new();
    private readonly ILogger<ScanJobCancellationService> _logger;

    public ScanJobCancellationService(ILogger<ScanJobCancellationService> logger)
    {
        _logger = logger;
    }

    public void RegisterJob(Guid jobId, CancellationTokenSource cts)
    {
        lock (_lock)
        {
            _tokens[jobId] = cts;
        }
    }

    public void UnregisterJob(Guid jobId)
    {
        lock (_lock)
        {
            _tokens.Remove(jobId);
        }
    }

    public bool CancelJob(Guid jobId)
    {
        CancellationTokenSource? cts;
        lock (_lock)
        {
            _tokens.TryGetValue(jobId, out cts);
        }

        if (cts == null)
        {
            return false;
        }

        try
        {
            _logger.LogInformation("Cancellation requested for scan job {JobId}", jobId);
            cts.Cancel();
            return true;
        }
        catch (ObjectDisposedException)
        {
            return false;
        }
    }
}
