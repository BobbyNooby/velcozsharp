"use client";

import { useState } from "react";

const NVD_API = "https://services.nvd.nist.gov/rest/json/cves/2.0";

const EXAMPLE_QUERIES = [
  "Ubuntu 22.04",
  "OpenSSL 1.1.1",
  "Windows 11",
  "Apache 2.4",
  "nginx 1.18",
  "Java 8",
  "Chrome 120",
  "PostgreSQL 15",
];

export default function NvdTestPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const search = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError("");
    setResults(null);
    setStatus("");

    try {
      // NVD API is public, no auth needed
      // Add a small delay to respect rate limits (6+ sec recommended without API key)
      const startTime = Date.now();
      const res = await fetch(`${NVD_API}?keywordSearch=${encodeURIComponent(q)}&resultsPerPage=20`);
      const elapsed = Date.now() - startTime;
      setStatus(`HTTP ${res.status} in ${elapsed}ms`);

      if (!res.ok) {
        const text = await res.text();
        setError(`NVD API error (${res.status}): ${text.slice(0, 200)}`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setResults(data);
    } catch (e: any) {
      setError(`Network error: ${e.message}`);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">NVD API Test</h1>
      <p className="text-sm text-gray-600">
        Direct queries to <code className="bg-gray-100 px-1">services.nvd.nist.gov</code>.
        Rate limited — expect ~6 seconds between requests without an API key.
      </p>

      {/* Search */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search(query)}
            className="flex-1 px-3 py-2 border rounded"
            placeholder="Search CVEs by keyword..."
          />
          <button
            onClick={() => search(query)}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </div>

        {/* Example queries */}
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => {
                setQuery(q);
                search(q);
              }}
              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-sm rounded"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Status / Error */}
      {status && <div className="text-sm text-gray-500">{status}</div>}
      {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

      {/* Results */}
      {results && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">
              Results: {results.resultsPerPage ?? 0} / {results.totalResults ?? 0} total
            </h2>
            {results.vulnerabilities && (
              <span className="text-sm text-gray-500">
                {results.vulnerabilities.length} CVEs returned
              </span>
            )}
          </div>

          {/* CVE Cards */}
          {results.vulnerabilities?.map((v: any, i: number) => {
            const cve = v.cve;
            const desc = cve.descriptions?.find((d: any) => d.lang === "en")?.value ?? "No description";
            const metrics = cve.metrics?.cvssMetricV31?.[0]?.cvssData ?? cve.metrics?.cvssMetricV30?.[0]?.cvssData;

            return (
              <div key={cve.id} className="border rounded p-3 space-y-1">
                <div className="flex justify-between items-start">
                  <a
                    href={`https://nvd.nist.gov/vuln/detail/${cve.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-semibold text-blue-700 hover:underline"
                  >
                    {cve.id}
                  </a>
                  {metrics && (
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      metrics.baseScore >= 7 ? 'bg-red-100 text-red-700' :
                      metrics.baseScore >= 4 ? 'bg-orange-100 text-orange-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      CVSS {metrics.baseScore} ({metrics.baseSeverity})
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-700">{desc.slice(0, 300)}{desc.length > 300 ? "..." : ""}</p>
                <div className="text-xs text-gray-400">
                  Published: {cve.published} | Modified: {cve.lastModified}
                </div>
              </div>
            );
          })}

          {/* Raw JSON toggle */}
          <details className="border rounded">
            <summary className="px-3 py-2 bg-gray-50 cursor-pointer text-sm font-medium">
              Raw JSON Response
            </summary>
            <pre className="p-3 text-xs overflow-x-auto bg-gray-900 text-green-400 max-h-96 overflow-y-auto">
              {JSON.stringify(results, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
