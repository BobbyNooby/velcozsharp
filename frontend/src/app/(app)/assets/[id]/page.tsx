"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useOrg, useApiFetch } from "@/lib/api";
import { severityColor, criticalityColor } from "@/lib/severity";
import { Button } from "@/components/ui/button";

type Vulnerability = {
  id: string;
  cveId: string;
  description?: string;
  cvssScore?: number;
  severity?: string;
  attackVector?: string;
  privilegesRequired?: string;
  userInteraction?: string;
  publishedDate?: string;
  detectedAt: string;
  status: string;
  matchedKeyword?: string;
};

type Asset = {
  id: string;
  name: string;
  description?: string;
  assetTypeId: string;
  assetTypeName: string;
  departmentId: string;
  departmentName: string;
  status: string;
  criticality: string;
  isCriticalityAuto: boolean;
  tags: string[];
  properties: Record<string, any>;
  highestCvssScore?: number;
  highestSeverity?: string;
  lastScannedAt?: string;
  vulnerabilityCount: number;
  vulnerabilities?: Vulnerability[];
  createdAt: string;
  updatedAt: string;
};

const statusColors: Record<string, string> = {
  Active: "bg-red-100 text-red-700",
  Acknowledged: "bg-yellow-100 text-yellow-700",
  "False Positive": "bg-gray-100 text-gray-700",
  Mitigated: "bg-green-100 text-green-700",
};

const vectorLabels: Record<string, string> = {
  NETWORK: "Network",
  ADJACENT_NETWORK: "Adjacent",
  LOCAL: "Local",
  PHYSICAL: "Physical",
};

function formatVectorSummary(attackVector?: string, privilegesRequired?: string, userInteraction?: string) {
  const parts: string[] = [];
  if (attackVector) parts.push(vectorLabels[attackVector.toUpperCase()] ?? attackVector);
  if (privilegesRequired) parts.push(privilegesRequired.toUpperCase() === "NONE" ? "no privileges" : `${privilegesRequired.toLowerCase()} privileges`);
  if (userInteraction) parts.push(userInteraction.toUpperCase() === "NONE" ? "no user interaction" : "user interaction required");
  return parts.join(" / ") || "—";
}

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params.id as string;
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [editCriticality, setEditCriticality] = useState("");
  const [editTags, setEditTags] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!assetId || !orgId) return;
    const controller = new AbortController();
    setLoading(true);
    setMessage("");

    apiFetch(`/assets/${assetId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!mountedRef.current) return;
        if (res.ok) {
          const data = await res.json();
          setAsset(data);
          setEditCriticality(data.criticality);
          setEditTags((data.tags ?? []).join(", "));
        } else if (res.status === 404) {
          setMessage("Asset not found");
        } else {
          setMessage("Failed to load asset");
        }
      })
      .catch(() => {
        if (mountedRef.current) setMessage("Network error");
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => controller.abort();
  }, [assetId, orgId, apiFetch]);

  const updateVulnStatus = async (vulnerabilityId: string, newStatus: string) => {
    try {
      const res = await apiFetch(`/assets/${assetId}/vulnerabilities/${vulnerabilityId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok && mountedRef.current) {
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
        if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
        messageTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setMessage("");
        }, 2000);
      } else if (mountedRef.current) {
        setMessage("Failed to update status");
      }
    } catch {
      if (mountedRef.current) setMessage("Network error");
    }
  };

  const scanAsset = async () => {
    setMessage("Scanning...");
    try {
      const res = await apiFetch(`/scan/assets/${assetId}`, { method: "POST" });
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setMessage(`Scan queued: job ${data.jobId}`);
      }
    } catch {
      if (mountedRef.current) setMessage("Scan failed");
    }
  };

  const saveDetails = async () => {
    if (!asset) return;
    setSaving(true);
    try {
      const body = {
        name: asset.name,
        description: asset.description,
        departmentId: asset.departmentId,
        status: asset.status,
        criticality: editCriticality,
        tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
        properties: asset.properties,
      };
      const res = await apiFetch(`/assets/${assetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok && mountedRef.current) {
        setMessage("Saved");
        const assetRes = await apiFetch(`/assets/${assetId}`);
        if (assetRes.ok && mountedRef.current) {
          const data = await assetRes.json();
          setAsset(data);
          setEditCriticality(data.criticality);
          setEditTags((data.tags ?? []).join(", "));
        }
      } else {
        const err = await res.json();
        setMessage(err.message ?? "Save failed");
      }
    } catch {
      if (mountedRef.current) setMessage("Network error");
    }
    setSaving(false);
  };

  if (loading || !authReady) {
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
        <Button className="mt-4" onClick={() => router.push("/cve-mapping")}>
          Back to Dashboard
        </Button>
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
          <Button variant="link" className="p-0 h-auto mb-2" onClick={() => router.push("/cve-mapping")}>
            &larr; Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold">{asset.name}</h1>
          <div className="text-sm text-gray-600 mt-1 flex flex-wrap items-center gap-2">
            <span>{asset.assetTypeName} &bull; {asset.departmentName}</span>
            <span
              className={`inline-block text-xs px-2 py-0.5 rounded ${
                asset.status === "Active"
                  ? "bg-green-100 text-green-700"
                  : asset.status === "Retired"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {asset.status}
            </span>
            <span className={`inline-block text-xs px-2 py-0.5 rounded border ${criticalityColor(asset.criticality, { border: true }) || "bg-gray-100 text-gray-600"}`}>
              {asset.criticality}
            </span>
            {asset.tags.map((tag) => (
              <span key={tag} className="inline-block text-xs px-2 py-0.5 rounded border bg-gray-50 text-gray-600">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <Button onClick={scanAsset}>Rescan CVEs</Button>
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

        <div className="border rounded-lg p-4 space-y-3">
          <h2 className="font-semibold">Classification</h2>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-500">Criticality</label>
              <select
                value={editCriticality}
                onChange={(e) => setEditCriticality(e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
              >
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
              {asset.isCriticalityAuto && <div className="text-[10px] text-gray-400">Auto-detected from scan</div>}
            </div>
            <div>
              <label className="text-xs text-gray-500">Tags (comma separated)</label>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="production, dmz, legacy"
              />
            </div>
            <Button size="sm" onClick={saveDetails} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
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
                      severityColor(vuln.severity, { border: true }) || "bg-gray-100 text-gray-700"
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
              {vuln.attackVector && (
                <span>
                  Vector: <span className="font-medium">{formatVectorSummary(vuln.attackVector, vuln.privilegesRequired, vuln.userInteraction)}</span>
                </span>
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
