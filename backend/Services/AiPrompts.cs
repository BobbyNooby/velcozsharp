using System.Reflection;
using System.Text;
using backend.Models.Dtos;

namespace backend.Services;

/// <summary>
/// Central location for all AI prompts used by the CVE mapping pipeline.
/// Prompt templates live under /Prompts/*.txt as embedded resources so they are
/// easy to identify, version, and tune without touching service code.
/// </summary>
public static class AiPrompts
{
    private const string KeywordSuggestionResource = "backend.Prompts.KeywordSuggestion.txt";
    private const string CveScoringResource = "backend.Prompts.CveScoring.txt";

    private static readonly Lazy<string> KeywordSuggestionTemplate = new(() => LoadEmbeddedResource(KeywordSuggestionResource));
    private static readonly Lazy<string> CveScoringTemplate = new(() => LoadEmbeddedResource(CveScoringResource));

    /// <summary>
    /// Builds the prompt that asks the LLM to suggest NVD keywordSearch terms
    /// for a batch of assets.
    /// </summary>
    public static string BuildKeywordSuggestionPrompt(List<AiAssetSummary> assets)
    {
        var assetLines = string.Join("\n", assets.Select(a =>
        {
            var props = string.Join(", ", a.Properties.Select(kv => $"{kv.Key}: {kv.Value}"));
            return $"ID:{a.Id} NAME:{a.Name} PROPS:{props}";
        }));

        return KeywordSuggestionTemplate.Value.Replace("{ASSET_LINES}", assetLines, StringComparison.Ordinal);
    }

    /// <summary>
    /// Builds the prompt that asks the LLM to score CVE relevance for each asset.
    /// </summary>
    public static string BuildCveScoringPrompt(List<AiAssetWithCves> assetsWithCves)
    {
        var sb = new StringBuilder();
        var first = true;

        foreach (var awc in assetsWithCves)
        {
            if (!first) sb.AppendLine();
            first = false;

            var props = string.Join(", ", awc.Asset.Properties.Select(kv => $"{kv.Key}: {kv.Value}"));
            sb.AppendLine($"ASSET_ID:{awc.Asset.Id} NAME:{awc.Asset.Name} PROPS:{props}");
            sb.AppendLine("CVEs found for this asset:");

            for (var i = 0; i < awc.Cves.Count; i++)
            {
                var c = awc.Cves[i];
                sb.AppendLine($"  [CVE_{i + 1:000}] {c.CveId}: CVSS {c.CvssScore} {c.Severity}. Affects: {c.AffectedInfo}. {c.Description}");
            }
        }

        return CveScoringTemplate.Value.Replace("{ASSET_SECTIONS}", sb.ToString(), StringComparison.Ordinal);
    }

    private static string LoadEmbeddedResource(string resourceName)
    {
        var assembly = Assembly.GetExecutingAssembly();
        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream == null)
        {
            throw new InvalidOperationException($"Embedded prompt resource '{resourceName}' not found. Available resources: {string.Join(", ", assembly.GetManifestResourceNames())}");
        }

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
