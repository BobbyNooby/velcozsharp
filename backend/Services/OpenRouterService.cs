using backend.Models.Dtos;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace backend.Services;

public interface IOpenRouterService
{
    Task<string> ChatAsync(string userMessage, bool requireJson = false, CancellationToken ct = default);
    Task<AiCveResult?> ScoreCveRelevanceAsync(string cveId, string description, string assetName, Dictionary<string, object> assetProperties, CancellationToken ct = default);
    Task<string> BulkSuggestKeywordsAsync(List<AiAssetSummary> assets, CancellationToken ct = default);
    Task<string> BulkScoreCvesAsync(List<AiAssetWithCves> assetsWithCves, CancellationToken ct = default);
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
        var model = configuration["OpenRouter:Model"] ?? "deepseek/deepseek-v4-flash";

        _model = model;

        _httpClient.BaseAddress = new Uri("https://openrouter.ai/api/v1/");
        _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");
        _httpClient.DefaultRequestHeaders.Add("HTTP-Referer", "https://github.com/velcozsharp");
        _httpClient.DefaultRequestHeaders.Add("X-Title", "VelcozSharp");
        _httpClient.Timeout = TimeSpan.FromSeconds(180);
    }

    public async Task<string> ChatAsync(string userMessage, bool requireJson = false, CancellationToken ct = default)
    {
        var requestBody = new OpenRouterChatRequest
        {
            Model = _model,
            Messages =
            [
                new OpenRouterMessageRequest { Role = "user", Content = userMessage }
            ],
            ResponseFormat = requireJson ? new OpenRouterResponseFormat { Type = "json_object" } : null
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

        var reply = await ChatAsync(prompt, requireJson: true, ct);

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

    public async Task<string> BulkSuggestKeywordsAsync(List<AiAssetSummary> assets, CancellationToken ct = default)
    {
        var assetLines = string.Join("\n", assets.Select((a, i) =>
        {
            var props = string.Join(", ", a.Properties.Select(kv => $"{kv.Key}: {kv.Value}"));
            return $"[ASSET_{i + 1:000}] {a.Name}: {props}";
        }));

        var prompt = "You are a cybersecurity analyst. Given these assets, suggest NVD API keywordSearch terms.\n" +
            "NVD keywordSearch does AND matching: all terms must appear in a CVE for it to match.\n" +
            "For each asset, suggest 2-4 specific but not overly narrow product/version keywords.\n" +
            "Prefer exact product names with MAJOR.MINOR version only. If the asset version is 15.4.2, use \"postgresql 15\".\n" +
            "If the asset version is 8.0.1, use \"java 8\" or just \"java\".\n" +
            "Never include patch-level versions like \"15.4.2\" or \"8.0.1\" as a keyword.\n" +
            "Avoid redundant duplicate terms.\n" +
            "Return ONLY a JSON object (no markdown, no code blocks) with this exact structure:\n" +
            "{\"results\":\"ASSET:<assetName>|KEYWORDS:<term1>,<term2>,<term3>\\nASSET:<assetName>|KEYWORDS:<term1>,<term2>\\n...\"}\n\n" +
            "Assets:\n" + assetLines + "\n\n" +
            "Rules:\n" +
            "- One line per asset in the \"results\" string.\n" +
            "- Each line format: ASSET:<name>|KEYWORDS:<comma-separated terms>\n" +
            "- Do not include extra text outside the JSON object.";

        var reply = await ChatAsync(prompt, requireJson: true, ct);
        var truncated = reply.Length > 500 ? reply[..500] + "..." : reply;
        _logger.LogInformation("AI keyword suggestion: {AssetCount} assets in -> {Chars} chars out. Raw: {Raw}", assets.Count, reply.Length, truncated);
        return reply;
    }

    public async Task<string> BulkScoreCvesAsync(List<AiAssetWithCves> assetsWithCves, CancellationToken ct = default)
    {
        var sections = new List<string>();
        var assetIndex = 1;
        foreach (var awc in assetsWithCves)
        {
            var props = string.Join(", ", awc.Asset.Properties.Select(kv => $"{kv.Key}: {kv.Value}"));
            var header = $"[ASSET_{assetIndex:000}] {awc.Asset.Name}: {props}";
            var cveLines = string.Join("\n", awc.Cves.Select((c, i) =>
                $"  [CVE_{i + 1:000}] {c.CveId}: CVSS {c.CvssScore} {c.Severity}. Affects: {c.AffectedInfo}. {c.Description}"));
            sections.Add($"{header}\nCVEs found for this asset:\n{cveLines}");
            assetIndex++;
        }

        var prompt = "You are a cybersecurity vulnerability analyst. For each asset below, assess ONLY the CVEs listed under that asset.\n" +
            "Do not score a CVE for an asset unless the asset actually runs the affected product/version.\n" +
            "Return ONLY a JSON object (no markdown, no code blocks) with this exact structure:\n" +
            "{\"results\":\"ASSET:<assetName>|CVE:<cveId>|SCORE:<0-100>|REASON:<brief reason>|MITIGATION:<action or empty>\\n...\"}\n\n" +
            string.Join("\n\n", sections) + "\n\n" +
            "Rules:\n" +
            "- SCORE 0 = completely unrelated (asset does not run the affected product/version)\n" +
            "- SCORE 1-100 = relevant (higher = more critical/severe)\n" +
            "- Include every asset-CVE combination shown above, even if SCORE is 0.\n" +
            "- REASON: 1 sentence explaining why it does or does not apply to THIS asset.\n" +
            "- MITIGATION: empty if score is 0, otherwise specific patch/upgrade action.\n" +
            "- Do not hallucinate CVEs. Do not recommend actions outside standard vulnerability management.\n" +
            "- Do not include markdown, code blocks, or text outside the JSON object.";

        var totalCves = assetsWithCves.Sum(a => a.Cves.Count);
        var reply = await ChatAsync(prompt, requireJson: true, ct);
        var truncated = reply.Length > 500 ? reply[..500] + "..." : reply;
        _logger.LogInformation("AI bulk scoring: {AssetCount} assets x {CveCount} CVEs in -> {Chars} chars out. Raw: {Raw}", assetsWithCves.Count, totalCves, reply.Length, truncated);
        return reply;
    }

    private class OpenRouterChatRequest
    {
        [JsonPropertyName("model")]
        public string Model { get; set; } = "";

        [JsonPropertyName("messages")]
        public List<OpenRouterMessageRequest> Messages { get; set; } = [];

        [JsonPropertyName("response_format")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public OpenRouterResponseFormat? ResponseFormat { get; set; }
    }

    private class OpenRouterMessageRequest
    {
        [JsonPropertyName("role")]
        public string Role { get; set; } = "";

        [JsonPropertyName("content")]
        public string Content { get; set; } = "";
    }

    private class OpenRouterResponseFormat
    {
        [JsonPropertyName("type")]
        public string Type { get; set; } = "json_object";
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
