using System.Net;
using System.Text.Json;

namespace backend.Services;

public interface INvdApiService
{
    Task<NvdSearchResult> SearchByKeywordsAsync(List<string> keywords, string? apiKey = null);
}

public class NvdApiService : INvdApiService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<NvdApiService> _logger;
    private DateTime _lastRequestTime = DateTime.MinValue;

    public NvdApiService(HttpClient httpClient, ILogger<NvdApiService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _httpClient.BaseAddress = new Uri("https://services.nvd.nist.gov/rest/json/cves/2.0/");
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
    }

    public async Task<NvdSearchResult> SearchByKeywordsAsync(List<string> keywords, string? apiKey = null)
    {
        var query = string.Join(" ", keywords);
        _logger.LogInformation("NVD search: {Query}", query);

        // Rate limiting: 6 seconds between requests if no API key
        if (string.IsNullOrEmpty(apiKey))
        {
            var elapsed = DateTime.UtcNow - _lastRequestTime;
            if (elapsed < TimeSpan.FromSeconds(6))
            {
                var delay = TimeSpan.FromSeconds(6) - elapsed;
                _logger.LogInformation("Rate limit: waiting {DelayMs}ms", delay.TotalMilliseconds);
                await Task.Delay(delay);
            }
        }

        var url = $"?keywordSearch={Uri.EscapeDataString(query)}&resultsPerPage=20";
        if (!string.IsNullOrEmpty(apiKey))
        {
            url += $"&apiKey={apiKey}";
        }

        try
        {
            _lastRequestTime = DateTime.UtcNow;
            var response = await _httpClient.GetAsync(url);

            if (response.StatusCode == HttpStatusCode.Forbidden || response.StatusCode == HttpStatusCode.TooManyRequests)
            {
                _logger.LogWarning("NVD rate limited (status {Status}). Waiting 10s and retrying...", response.StatusCode);
                await Task.Delay(TimeSpan.FromSeconds(10));
                _lastRequestTime = DateTime.UtcNow;
                response = await _httpClient.GetAsync(url);
            }

            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            var result = JsonSerializer.Deserialize<NvdSearchResult>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            return result ?? new NvdSearchResult();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "NVD API request failed for query: {Query}", query);
            throw;
        }
    }
}

public class NvdSearchResult
{
    public int ResultsPerPage { get; set; }
    public int StartIndex { get; set; }
    public int TotalResults { get; set; }
    public List<NvdVulnerability> Vulnerabilities { get; set; } = [];
}

public class NvdVulnerability
{
    public NvdCve Cve { get; set; } = null!;
}

public class NvdCve
{
    public string Id { get; set; } = "";
    public string? SourceIdentifier { get; set; }
    public string? Published { get; set; }
    public string? LastModified { get; set; }
    public string? VulnStatus { get; set; }
    public List<NvdDescription> Descriptions { get; set; } = [];
    public NvdMetrics? Metrics { get; set; }
    public List<NvdWeakness> Weaknesses { get; set; } = [];
    public List<NvdConfiguration> Configurations { get; set; } = [];
    public List<NvdReference> References { get; set; } = [];
}

public class NvdDescription
{
    public string Lang { get; set; } = "";
    public string Value { get; set; } = "";
}

public class NvdMetrics
{
    public List<NvdCvssMetric>? CvssMetricV31 { get; set; }
    public List<NvdCvssMetric>? CvssMetricV30 { get; set; }
    public List<NvdCvssMetric>? CvssMetricV2 { get; set; }
}

public class NvdCvssMetric
{
    public string? Source { get; set; }
    public string? Type { get; set; }
    public NvdCvssData? CvssData { get; set; }
    public double? ExploitabilityScore { get; set; }
    public double? ImpactScore { get; set; }
}

public class NvdCvssData
{
    public string? Version { get; set; }
    public string? VectorString { get; set; }
    public string? AttackVector { get; set; }
    public string? AttackComplexity { get; set; }
    public string? PrivilegesRequired { get; set; }
    public string? UserInteraction { get; set; }
    public string? Scope { get; set; }
    public string? ConfidentialityImpact { get; set; }
    public string? IntegrityImpact { get; set; }
    public string? AvailabilityImpact { get; set; }
    public double? BaseScore { get; set; }
    public string? BaseSeverity { get; set; }
}

public class NvdWeakness
{
    public string? Source { get; set; }
    public string? Type { get; set; }
    public List<NvdDescription> Description { get; set; } = [];
}

public class NvdConfiguration
{
    public List<NvdNode> Nodes { get; set; } = [];
}

public class NvdNode
{
    public string? Operator { get; set; }
    public bool Negate { get; set; }
    public List<NvdCpeMatch> CpeMatch { get; set; } = [];
}

public class NvdCpeMatch
{
    public bool Vulnerable { get; set; }
    public string? Criteria { get; set; }
    public string? MatchCriteriaId { get; set; }
    public string? VersionStartIncluding { get; set; }
    public string? VersionStartExcluding { get; set; }
    public string? VersionEndIncluding { get; set; }
    public string? VersionEndExcluding { get; set; }
}

public class NvdReference
{
    public string? Url { get; set; }
    public string? Source { get; set; }
    public List<string> Tags { get; set; } = [];
}
