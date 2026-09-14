using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace backend.Services;

public interface IValyuService
{
    /// <summary>True when a Valyu API key is configured. Safe to call without spending credits.</summary>
    bool IsConfigured { get; }

    /// <summary>
    /// Calls POST /v1/search. Never throws for HTTP/API failures — errors are returned
    /// on the response so a multi-query brief can skip failed queries and keep going.
    /// </summary>
    Task<ValyuSearchResponse> SearchAsync(ValyuSearchRequest request, CancellationToken ct = default);

    /// <summary>Starts an async DeepResearch task (POST /v1/deepresearch/tasks).</summary>
    Task<ValyuDeepResearchCreateResponse> CreateDeepResearchTaskAsync(ValyuDeepResearchCreateRequest request, CancellationToken ct = default);

    /// <summary>Polls a DeepResearch task (GET /v1/deepresearch/tasks/{id}/status).</summary>
    Task<ValyuDeepResearchStatusResponse> GetDeepResearchStatusAsync(string taskId, CancellationToken ct = default);
}

public class ValyuService : IValyuService
{
    private static readonly JsonSerializerOptions ReadOptions = new() { PropertyNameCaseInsensitive = true };
    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        // Valyu request schemas are additionalProperties:false — omit nulls rather than send them.
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _httpClient;
    private readonly ILogger<ValyuService> _logger;

    public ValyuService(HttpClient httpClient, IConfiguration configuration, ILogger<ValyuService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;

        var baseUrl = configuration["Valyu:BaseAddress"] ?? "https://api.valyu.ai";
        _httpClient.BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/");
        _httpClient.Timeout = TimeSpan.FromSeconds(30);

        var apiKey = configuration["Valyu:ApiKey"] ?? "";
        IsConfigured = !string.IsNullOrWhiteSpace(apiKey);
        if (IsConfigured)
        {
            _httpClient.DefaultRequestHeaders.Add("x-api-key", apiKey);
        }
    }

    public bool IsConfigured { get; }

    public async Task<ValyuSearchResponse> SearchAsync(ValyuSearchRequest request, CancellationToken ct = default)
    {
        if (!IsConfigured)
        {
            return new ValyuSearchResponse
            {
                Success = false,
                Error = "Valyu API key is not configured. Set it with: dotnet user-secrets set \"Valyu:ApiKey\" <key>"
            };
        }

        try
        {
            var json = JsonSerializer.Serialize(request, WriteOptions);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync("v1/search", content, ct);

            if (!response.IsSuccessStatusCode)
            {
                var status = (int)response.StatusCode;
                var friendly = status switch
                {
                    401 or 403 => $"Valyu rejected the request ({status}). Check the Valyu:ApiKey value, and that the key's plan covers the requested sources.",
                    402 => "Valyu credits exhausted or the source needs a plan (402).",
                    429 => "Valyu rate limit hit (429), retry shortly.",
                    _ => $"Valyu search failed with status {status}."
                };
                _logger.LogWarning("Valyu search failed ({Status}): {Query}", status, request.Query);
                return new ValyuSearchResponse { Success = false, Error = friendly, Query = request.Query };
            }

            var body = await response.Content.ReadAsStringAsync(ct);
            var result = JsonSerializer.Deserialize<ValyuSearchResponse>(body, ReadOptions);

            if (result == null)
            {
                return new ValyuSearchResponse { Success = false, Error = "Valyu returned an unreadable response.", Query = request.Query };
            }

            result.Query = request.Query;
            // Valyu sends "error": "" even on success; normalize it to null so callers can
            // use Error == null as the "this query succeeded cleanly" signal.
            if (string.IsNullOrEmpty(result.Error))
                result.Error = null;
            return result;
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Valyu query cancelled: {Query}", request.Query);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Valyu search request failed for query: {Query}", request.Query);
            return new ValyuSearchResponse { Success = false, Error = $"Valyu request error: {ex.Message}", Query = request.Query };
        }
    }

    public async Task<ValyuDeepResearchCreateResponse> CreateDeepResearchTaskAsync(ValyuDeepResearchCreateRequest request, CancellationToken ct = default)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("Valyu API key is not configured.");

        var json = JsonSerializer.Serialize(request, WriteOptions);
        var content = new StringContent(json, Encoding.UTF8, "application/json");
        var response = await _httpClient.PostAsync("v1/deepresearch/tasks", content, ct);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            _logger.LogWarning("Valyu DeepResearch create failed ({Status}): {Body}", (int)response.StatusCode, body);
            throw new InvalidOperationException($"Valyu DeepResearch task could not be started (status {(int)response.StatusCode}).");
        }

        var result = JsonSerializer.Deserialize<ValyuDeepResearchCreateResponse>(await response.Content.ReadAsStringAsync(ct), ReadOptions);
        return result ?? throw new InvalidOperationException("Valyu returned an unreadable DeepResearch response.");
    }

    public async Task<ValyuDeepResearchStatusResponse> GetDeepResearchStatusAsync(string taskId, CancellationToken ct = default)
    {
        var response = await _httpClient.GetAsync($"v1/deepresearch/tasks/{Uri.EscapeDataString(taskId)}/status", ct);
        response.EnsureSuccessStatusCode();
        var result = JsonSerializer.Deserialize<ValyuDeepResearchStatusResponse>(await response.Content.ReadAsStringAsync(ct), ReadOptions);
        return result ?? throw new InvalidOperationException("Valyu returned an unreadable DeepResearch status.");
    }
}

public class ValyuSearchRequest
{
    [JsonPropertyName("query")]
    public string Query { get; set; } = "";

    /// <summary>"all" | "web" | "proprietary" | "news"</summary>
    [JsonPropertyName("search_type")]
    public string SearchType { get; set; } = "all";

    [JsonPropertyName("max_num_results")]
    public int MaxNumResults { get; set; } = 5;

    /// <summary>Dataset ids, domains, or presets (e.g. "cybersecurity", "compliance").</summary>
    [JsonPropertyName("included_sources")]
    public List<string>? IncludedSources { get; set; }

    [JsonPropertyName("relevance_threshold")]
    public double RelevanceThreshold { get; set; } = 0.5;

    /// <summary>YYYY-MM-DD. Put time windows here — never a year inside the query text.</summary>
    [JsonPropertyName("start_date")]
    public string? StartDate { get; set; }

    [JsonPropertyName("end_date")]
    public string? EndDate { get; set; }

    [JsonPropertyName("is_tool_call")]
    public bool IsToolCall { get; set; } = true;

    /// <summary>
    /// Max characters of content per result. The spec accepts any positive integer;
    /// a low cap keeps CPM-based billing down — briefs only need snippets, not full pages.
    /// </summary>
    [JsonPropertyName("response_length")]
    public int ResponseLength { get; set; } = 2000;
}

public class ValyuSearchResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("error")]
    public string? Error { get; set; }

    public string? Query { get; set; }

    [JsonPropertyName("results")]
    public List<ValyuSearchResultItem> Results { get; set; } = [];

    [JsonPropertyName("results_by_source")]
    public Dictionary<string, int>? ResultsBySource { get; set; }

    [JsonPropertyName("total_deduction_dollars")]
    public decimal? TotalDeductionDollars { get; set; }

    /// <summary>Non-fatal warnings (e.g. source resolution issues). May appear even on success.</summary>
    [JsonPropertyName("warnings")]
    public List<string>? Warnings { get; set; }
}

public class ValyuSearchResultItem
{
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("url")]
    public string? Url { get; set; }

    [JsonPropertyName("content")]
    public string? Content { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("source")]
    public string? Source { get; set; }

    [JsonPropertyName("relevance_score")]
    public double? RelevanceScore { get; set; }

    [JsonPropertyName("publication_date")]
    public string? PublicationDate { get; set; }
}

public class ValyuDeepResearchCreateRequest
{
    /// <summary>The research brief. Max 25,000 characters.</summary>
    [JsonPropertyName("query")]
    public string Query { get; set; } = "";

    /// <summary>fast (~5 min, ~$0.10) | standard (~10-20 min, ~$0.50) | heavy | max</summary>
    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "fast";

    /// <summary>Natural-language guidance for how the agent should research.</summary>
    [JsonPropertyName("research_strategy")]
    public string? ResearchStrategy { get; set; }

    /// <summary>Natural-language instructions for report structure and style.</summary>
    [JsonPropertyName("report_format")]
    public string? ReportFormat { get; set; }

    [JsonPropertyName("output_formats")]
    public List<string> OutputFormats { get; set; } = ["markdown", "pdf"];
}

public class ValyuDeepResearchCreateResponse
{
    [JsonPropertyName("deepresearch_id")]
    public string DeepResearchId { get; set; } = "";

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "";

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}

public class ValyuDeepResearchStatusResponse
{
    [JsonPropertyName("deepresearch_id")]
    public string DeepResearchId { get; set; } = "";

    /// <summary>queued | running | completed | failed | cancelled</summary>
    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "";

    [JsonPropertyName("created_at")]
    public DateTime? CreatedAt { get; set; }

    [JsonPropertyName("completed_at")]
    public DateTime? CompletedAt { get; set; }

    [JsonPropertyName("progress")]
    public ValyuDeepResearchProgress? Progress { get; set; }

    /// <summary>Markdown report. Present when completed (may be partial on failed).</summary>
    [JsonPropertyName("output")]
    public System.Text.Json.JsonElement? Output { get; set; }

    [JsonPropertyName("cost")]
    public decimal? Cost { get; set; }

    [JsonPropertyName("pdf_url")]
    public string? PdfUrl { get; set; }

    [JsonPropertyName("error")]
    public string? Error { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("sources")]
    public List<ValyuDeepResearchSource>? Sources { get; set; }

    public string? OutputText => Output?.ValueKind == System.Text.Json.JsonValueKind.String
        ? Output.Value.GetString()
        : null;
}

public class ValyuDeepResearchProgress
{
    [JsonPropertyName("current_step")]
    public int CurrentStep { get; set; }

    [JsonPropertyName("total_steps")]
    public int? TotalSteps { get; set; }
}

public class ValyuDeepResearchSource
{
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("url")]
    public string? Url { get; set; }
}
