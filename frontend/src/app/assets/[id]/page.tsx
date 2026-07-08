"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

const API = "http://localhost:5038/api";

type Vulnerability = {
  id: string;
  cveId: string;
  description?: string;
  cvssScore?: number;
  severity?: string;
  publishedDate?: string;
  detectedAt: string;
  status: string;
  matchedKeyword?: string;
};

type Asset = {
  id: string;
  name: string;
  description?: string;
  assetTypeName: string;
  departmentName: string;
  status: string;
  properties: Record<string, any>;
  highestCvssScore?: number;
  highestSeverity?: string;
  lastScannedAt?: string;
  vulnerabilityCount: number;
  vulnerabilities?: Vulnerability[];
  createdAt: string;
  updatedAt: string;
};

const severityColors: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 border-red-300",
  HIGH: "bg-orange-100 text-orange-700 border-orange-300",
  MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-300",
  LOW: "bg-blue-100 text-blue-700 border-blue-300",
};

const statusColors: Record<string, string> = {
  Active: "bg-red-100 text-red-700",
  Acknowledged: "bg-yellow-100 text-yellow-700",
  "False Positive": "bg-gray-100 text-gray-700",
  Mitigated: "bg-green-100 text-green-700",
};

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params.id as string;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [currentOrgId, setCurrentOrgId] = useState<string>("");

  const apiFetch = useCallback(
    async (path: string, options?: RequestInit) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options?.headers as Record<string, string>),
      };
      if (currentOrgId) headers["X-Organization-Id"] = currentOrgId;
      const res = await fetch(`${API}${path}`, { ...options, headers, credentials: "include" });
      return res;
    },
    [currentOrgId]
  );

  const fetchMe = async () => {
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.organizations?.length > 0) {
          const defaultOrg = data.organizations.find((o: any) => o.isDefault);
          if (defaultOrg) setCurrentOrgId(defaultOrg.organizationId);
        }
      }
    } catch {}
  };

  const fetchAsset = async () => {
    if (!assetId || !currentOrgId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/assets/${assetId}`);
      if (res.ok) {
        const data = await res.json();
        setAsset(data);
      } else if (res.status === 404) {
        setMessage("Asset not found");
      } else {
        setMessage("Failed to load asset");
      }
    } catch {
      setMessage("Network error");
    }
    setLoading(false);
  };

  const updateVulnStatus = async (vulnerabilityId: string, newStatus: string) => {
    try {
      const res = await apiFetch(`/assets/${assetId}/vulnerabilities/${vulnerabilityId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setMessage(`Status updated to ${newStatus}`);
        setAsset((prev) => {
          if (!prev || !prev.vulnerabilities) return prev;
          return {
            ...prev,
            vulnerabilities: prev.vulnerabilities.map((v) =>
              v.id === vulnerabilityId ? { ...v, status: newStatus } : v
            ),
          };
        });
        setTimeout(() => setMessage(""), 2000);
      } else {
        setMessage("Failed to update status");
      }
    } catch {
      setMessage("Network error");
    }
  };

  const scanAsset = async () => {
    setMessage("Scanning...");
    try {
      const res = await apiFetch(`/scan/assets/${assetId}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setMessage(`Scan complete: ${data.vulnerabilitiesFound} CVE(s) found`);
        await fetchAsset();
      }
    } catch {
      setMessage("Scan failed");
    }
  };

  useEffect(() => {
    fetchMe();
  }, []);

  useEffect(() => {
    if (currentOrgId) fetchAsset();
  }, [currentOrgId]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="text-gray-500">Loading asset...</div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="text-red-600">{message || "Asset not found"}</div>
        <button
          onClick={() => router.push("/cve-mapping")}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const vulns = asset.vulnerabilities ?? [];
  const activeVulns = vulns.filter((v) => v.status === "Active");

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <button
            onClick={() => router.push("/cve-mapping")}
            className="text-sm text-blue-600 hover:underline mb-2"
          >
            &larr; Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold">{asset.name}</h1>
          <div className="text-sm text-gray-600 mt-1">
            {asset.assetTypeName} &bull; {asset.departmentName} &bull;
            <span
              className={`ml-1 inline-block text-xs px-2 py-0.5 rounded ${
                asset.status === "Active"
                  ? "bg-green-100 text-green-700"
                  : asset.status === "Retired"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {asset.status}
            </span>
          </div>
        </div>
        <button
          onClick={scanAsset}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Rescan CVEs
        </button>
      </div>

      {message && (
        <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm">{message}</div>
      )}

      {/* Asset Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4 space-y-3">
          <h2 className="font-semibold">Properties</h2>
          {asset.properties && Object.keys(asset.properties).length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(asset.properties).map(([key, value]) => (
                <div key={key} className="text-sm">
                  <span className="text-gray-500 capitalize">{key.replace(/_/g, " ")}:</span>{" "}
                  <span className="font-medium">{String(value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No properties</div>
          )}
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <h2 className="font-semibold">Risk Summary</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center border rounded p-2">
              <div className="text-2xl font-bold text-red-600">{asset.vulnerabilityCount}</div>
              <div className="text-xs text-gray-500">Total CVEs</div>
            </div>
            <div className="text-center border rounded p-2">
              <div className="text-2xl font-bold text-orange-600">{activeVulns.length}</div>
              <div className="text-xs text-gray-500">Active CVEs</div>
            </div>
            <div className="text-center border rounded p-2">
              <div className="text-2xl font-bold">
                {asset.highestCvssScore ?? "—"}
              </div>
              <div className="text-xs text-gray-500">Highest CVSS</div>
            </div>
            <div className="text-center border rounded p-2">
              <div className="text-lg font-bold">
                {asset.highestSeverity ?? "—"}
              </div>
              <div className="text-xs text-gray-500">Highest Severity</div>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Last scanned: {asset.lastScannedAt ? new Date(asset.lastScannedAt).toLocaleString() : "Never"}
          </div>
        </div>
      </div>

      {/* Vulnerabilities */}
      <div className="space-y-4">
        <h2 className="font-semibold text-lg">Vulnerabilities</h2>

        {vulns.length === 0 && (
          <div className="text-center py-8 text-gray-500 border rounded-lg">
            <div className="text-lg">No CVEs found</div>
            <div className="text-sm">Click "Rescan CVEs" to check for vulnerabilities</div>
          </div>
        )}

        {vulns.map((vuln) => (
          <div key={vuln.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-start flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-lg">{vuln.cveId}</h3>
                {vuln.severity && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded border ${
                      severityColors[vuln.severity.toUpperCase()] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {vuln.severity} {vuln.cvssScore}
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    statusColors[vuln.status] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {vuln.status}
                </span>
              </div>
              <select
                value={vuln.status}
                onChange={(e) => updateVulnStatus(vuln.id, e.target.value)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="Active">Active</option>
                <option value="Acknowledged">Acknowledged</option>
                <option value="False Positive">False Positive</option>
                <option value="Mitigated">Mitigated</option>
              </select>
            </div>

            {vuln.description && (
              <p className="text-sm text-gray-700">{vuln.description}</p>
            )}

            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              {vuln.matchedKeyword && (
                <span>Matched: <span className="font-medium">{vuln.matchedKeyword}</span></span>
              )}
              {vuln.publishedDate && (
                <span>Published: {new Date(vuln.publishedDate).toLocaleDateString()}</span>
              )}
              <span>Detected: {new Date(vuln.detectedAt).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
