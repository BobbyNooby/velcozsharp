using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace backend.Services;

public interface IOpenRouterService
{
    Task<string> ChatAsync(string userMessage, CancellationToken ct = default);
    Task<AiCveResult?> ScoreCveRelevanceAsync(string cveId, string description, string assetName, Dictionary<string, object> assetProperties, CancellationToken ct = default);
}

public class OpenRouterService : IOpenRouterService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<OpenRouterService> _logger;
    private readonly string _model;

    public OpenRouterService(HttpClient httpClient, IConfiguration configuration, ILogger<OpenRouterService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;

        var apiKey = configuration["OpenRouter:ApiKey"] ?? "";
        var model = configuration["OpenRouter:Model"] ?? "openrouter/free";

        _model = model;

        _httpClient.BaseAddress = new Uri("https://openrouter.ai/api/v1/");
        _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");
        _httpClient.DefaultRequestHeaders.Add("HTTP-Referer", "https://github.com/velcozsharp");
        _httpClient.DefaultRequestHeaders.Add("X-Title", "VelcozSharp");
        _httpClient.Timeout = TimeSpan.FromSeconds(60);
    }

    public async Task<string> ChatAsync(string userMessage, CancellationToken ct = default)
    {
        var requestBody = new
        {
            model = _model,
            messages = new[]
            {
                new { role = "user", content = userMessage }
            }
        };

        var json = JsonSerializer.Serialize(requestBody);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _httpClient.PostAsync("chat/completions", content, ct);
        response.EnsureSuccessStatusCode();

        var responseJson = await response.Content.ReadAsStringAsync(ct);
        var result = JsonSerializer.Deserialize<OpenRouterChatResponse>(responseJson, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        var reply = result?.Choices?.FirstOrDefault()?.Message?.Content ?? "No response from model.";
        _logger.LogInformation("OpenRouter chat: {InputLength} chars in -> {OutputLength} chars out", userMessage.Length, reply.Length);

        return reply;
    }

    public async Task<AiCveResult?> ScoreCveRelevanceAsync(string cveId, string description, string assetName, Dictionary<string, object> assetProperties, CancellationToken ct = default)
    {
        var propertiesText = string.Join("\n", assetProperties.Select(kv => $"- {kv.Key}: {kv.Value}"));
        var prompt = $@"You are a cybersecurity vulnerability analyst. For the given CVE and asset, assess relevance and suggest mitigation.

CVE ID: {cveId}
CVE Description: {description}

Asset Name: {assetName}
Asset Properties:
{propertiesText}

Return ONLY a JSON object with these fields (no markdown, no code block):
{{
  ""relevance_score"": <0-100>,
  ""relevance_reasoning"": ""<1-2 sentences>"",
  ""suggested_mitigation"": ""<patch, upgrade, or workaround steps, or empty if not relevant>""
}}

A score of 0 means the CVE is completely unrelated to this asset. A score of 100 means it is definitely applicable.
Do NOT hallucinate CVEs. Do NOT recommend actions outside of standard vulnerability management.";

        var reply = await ChatAsync(prompt, ct);

        try
        {
            var cleaned = reply.Trim();
            if (cleaned.StartsWith("```json")) cleaned = cleaned[7..];
            if (cleaned.StartsWith("```")) cleaned = cleaned[3..];
            if (cleaned.EndsWith("```")) cleaned = cleaned[..^3];
            cleaned = cleaned.Trim();

            var result = JsonSerializer.Deserialize<AiCveResult>(cleaned, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (result != null)
            {
                result.RelevanceScore = Math.Clamp(result.RelevanceScore, 0, 100);
            }

            return result;
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to parse AI response for CVE {CveId}: {Response}", cveId, reply[..Math.Min(200, reply.Length)]);
            return null;
        }
    }

    private class OpenRouterChatResponse
    {
        public List<OpenRouterChoice>? Choices { get; set; }
    }

    private class OpenRouterChoice
    {
        public OpenRouterMessage? Message { get; set; }
    }

    private class OpenRouterMessage
    {
        public string? Content { get; set; }
    }
}

public class AiCveResult
{
    [JsonPropertyName("relevance_score")]
    public int RelevanceScore { get; set; }

    [JsonPropertyName("relevance_reasoning")]
    public string? RelevanceReasoning { get; set; }

    [JsonPropertyName("suggested_mitigation")]
    public string? SuggestedMitigation { get; set; }
}
