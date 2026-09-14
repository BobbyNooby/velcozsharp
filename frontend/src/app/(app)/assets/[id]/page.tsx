"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrg, useApiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { severityColor, criticalityColor, severityRank, SeverityBadge } from "@/lib/severity";
import { AssetFormDialog, type AssetFormValues } from "@/components/asset-form-dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

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
  properties: Record<string, unknown>;
  highestCvssScore?: number;
  highestSeverity?: string;
  lastScannedAt?: string;
  vulnerabilityCount: number;
  vulnerabilities?: Vulnerability[];
  createdAt: string;
  updatedAt: string;
};

const assetStatusClass: Record<string, string> = {
  Active: "bg-green-500/12 text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-500/20",
  Retired: "bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20",
  Decommissioned: "bg-muted text-muted-foreground ring-1 ring-inset ring-foreground/10",
};

const vulnStatusClass: Record<string, string> = {
  Active: "bg-red-500/12 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-500/20",
  Acknowledged: "bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20",
  "False Positive": "bg-muted text-muted-foreground ring-1 ring-inset ring-foreground/10",
  Mitigated: "bg-green-500/12 text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-500/20",
};

const mutedChip = "bg-muted text-muted-foreground";

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
  const { addToast } = useToast();
  const mountedRef = useRef(true);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [confirmingDecommission, setConfirmingDecommission] = useState(false);
  const [decommissioning, setDecommissioning] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, []);

  const fetchAsset = useCallback(async (signal?: AbortSignal) => {
    const res = await apiFetch(`/assets/${assetId}`, { signal });
    if (!mountedRef.current) return false;
    if (res.ok) {
      const data = await res.json();
      setAsset(data);
      setMessage("");
      return true;
    }
    if (res.status === 404) {
      setMessage("Asset not found");
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.message ?? "Failed to load asset");
    }
    return false;
  }, [apiFetch, assetId]);

  useEffect(() => {
    if (!assetId || !orgId) return;
    const controller = new AbortController();
    setLoading(true);
    setMessage("");

    fetchAsset(controller.signal)
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        if (mountedRef.current) {
          setMessage(err instanceof Error && err.message ? err.message : "Network error");
        }
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => controller.abort();
  }, [assetId, orgId, fetchAsset]);

  const refreshAsset = useCallback(() => {
    return fetchAsset().catch((err: unknown) => {
      if (mountedRef.current) {
        setMessage(err instanceof Error && err.message ? err.message : "Network error");
      }
    });
  }, [fetchAsset]);

  const updateVulnStatus = async (vulnerabilityId: string, newStatus: string) => {
    try {
      const res = await apiFetch(`/assets/${assetId}/vulnerabilities/${vulnerabilityId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!mountedRef.current) return;
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
        if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
        messageTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setMessage("");
        }, 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.message ?? "Failed to update status");
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setMessage(err instanceof Error && err.message ? err.message : "Network error");
      }
    }
  };

  const scanAsset = async () => {
    setMessage("Scanning...");
    try {
      const res = await apiFetch(`/scan/assets/${assetId}`, { method: "POST" });
      if (!mountedRef.current) return;
      if (res.ok) {
        const data = await res.json();
        setMessage(`Scan queued: job ${data.jobId}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.message ?? "Scan failed");
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setMessage(err instanceof Error && err.message ? err.message : "Scan failed");
      }
    }
  };

  const decommissionAsset = async () => {
    if (!asset) return;
    setDecommissioning(true);
    try {
      const res = await apiFetch(`/assets/${assetId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: asset.name,
          description: asset.description ?? null,
          departmentId: asset.departmentId,
          status: "Retired",
          criticality: asset.criticality,
          isCriticalityAuto: asset.isCriticalityAuto,
          tags: asset.tags ?? [],
          properties: asset.properties,
        }),
      });
      if (!mountedRef.current) return;
      if (res.ok) {
        addToast({
          title: "Asset decommissioned",
          message: `${asset.name} was retired.`,
          variant: "success",
        });
        setConfirmingDecommission(false);
        await refreshAsset();
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.message ?? "Failed to decommission asset");
        setConfirmingDecommission(false);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setMessage(err instanceof Error && err.message ? err.message : "Network error");
      }
    } finally {
      if (mountedRef.current) setDecommissioning(false);
    }
  };

  if (loading || !authReady) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="text-muted-foreground">Loading asset...</div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="text-red-600 dark:text-red-400" role="alert">{message || "Asset not found"}</div>
        <Button className="mt-4" onClick={() => router.push("/assets")}>
          Back to Assets
        </Button>
      </div>
    );
  }

  const vulns = asset.vulnerabilities ?? [];
  const activeVulns = vulns.filter((v) => v.status === "Active");

  // Prefer server-computed risk fields when present; otherwise derive from the CVE list.
  const computedHighestCvss = vulns.reduce((max, v) => Math.max(max, v.cvssScore ?? 0), 0);
  const highestCvss = asset.highestCvssScore ?? (computedHighestCvss > 0 ? computedHighestCvss : undefined);
  const withSeverity = vulns.filter((v): v is Vulnerability & { severity: string } => Boolean(v.severity));
  const highestSeverity =
    asset.highestSeverity ??
    [...withSeverity].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0]?.severity;

  const assetFormValues: AssetFormValues = {
    id: asset.id,
    name: asset.name,
    description: asset.description,
    assetTypeId: asset.assetTypeId,
    departmentId: asset.departmentId,
    status: asset.status,
    criticality: asset.criticality,
    isCriticalityAuto: asset.isCriticalityAuto,
    tags: asset.tags,
    properties: asset.properties,
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <Button variant="link" className="p-0 h-auto mb-2" onClick={() => router.push("/assets")}>
            &larr; Back to Assets
          </Button>
          <h1 className="text-2xl font-bold">{asset.name}</h1>
          {asset.description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{asset.description}</p>
          )}
          <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
            <span>{asset.assetTypeName} &bull; {asset.departmentName}</span>
            <span
              className={`inline-block text-xs px-2 py-0.5 rounded ${assetStatusClass[asset.status] ?? mutedChip}`}
            >
              {asset.status}
            </span>
            <span
              className={`inline-block text-xs px-2 py-0.5 rounded border ${criticalityColor(asset.criticality, { border: true }) || `border-transparent ${mutedChip}`}`}
            >
              {asset.criticality}
            </span>
            {asset.tags.map((tag) => (
              <span key={tag} className={`inline-block text-xs px-2 py-0.5 rounded ${mutedChip}`}>
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={scanAsset}>Rescan CVEs</Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            Edit Asset
          </Button>
          {asset.status !== "Retired" && (
            confirmingDecommission ? (
              <>
                <span className="text-sm text-muted-foreground">Retire this asset?</span>
                <Button variant="destructive" onClick={decommissionAsset} disabled={decommissioning}>
                  {decommissioning && <Loader2 className="mr-1 size-4 animate-spin" />}
                  Confirm decommission
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmingDecommission(false)}
                  disabled={decommissioning}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="destructive" onClick={() => setConfirmingDecommission(true)}>
                Decommission
              </Button>
            )
          )}
        </div>
      </div>

      {message && (
        <div className="bg-primary/10 text-primary px-3 py-2 rounded text-sm" role="status">{message}</div>
      )}

      {/* Asset Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4 space-y-3">
          <h2 className="font-semibold">Properties</h2>
          {asset.properties && Object.keys(asset.properties).length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(asset.properties).map(([key, value]) => (
                <div key={key} className="text-sm">
                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}:</span>{" "}
                  <span className="font-medium">{String(value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No properties</div>
          )}
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <h2 className="font-semibold">Risk Summary</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center border rounded p-2">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{asset.vulnerabilityCount}</div>
              <div className="text-xs text-muted-foreground">Total CVEs</div>
            </div>
            <div className="text-center border rounded p-2">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{activeVulns.length}</div>
              <div className="text-xs text-muted-foreground">Active CVEs</div>
            </div>
            <div className="text-center border rounded p-2">
              <div className="text-2xl font-bold">
                {highestCvss ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">Highest CVSS</div>
            </div>
            <div className="text-center border rounded p-2">
              <div className="text-lg font-bold">
                {highestSeverity ? <SeverityBadge severity={highestSeverity} /> : "—"}
              </div>
              <div className="text-xs text-muted-foreground">Highest Severity</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Last scanned: {asset.lastScannedAt ? new Date(asset.lastScannedAt).toLocaleString() : "Never"}
          </div>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <h2 className="font-semibold">Classification</h2>
          <div className="text-sm">
            <span className="text-muted-foreground">Criticality:</span>{" "}
            <span className="font-medium">{asset.criticality}</span>
            {asset.isCriticalityAuto && (
              <span className="text-xs text-muted-foreground/70"> (auto-detected from scan)</span>
            )}
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Tags:</span>{" "}
            {asset.tags.length > 0 ? (
              <span className="font-medium">{asset.tags.join(", ")}</span>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Department:</span>{" "}
            <span className="font-medium">{asset.departmentName}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Use &ldquo;Edit Asset&rdquo; to update the name, description, department, criticality, tags, status, or properties.
          </p>
        </div>
      </div>

      {/* Vulnerabilities */}
      <div className="space-y-4">
        <h2 className="font-semibold text-lg">Vulnerabilities</h2>

        {vulns.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border rounded-lg">
            <div className="text-lg">No CVEs found</div>
            <div className="text-sm">Click &ldquo;Rescan CVEs&rdquo; to check for vulnerabilities</div>
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
                      severityColor(vuln.severity, { border: true }) || `border-transparent ${mutedChip}`
                    }`}
                  >
                    {vuln.severity} {vuln.cvssScore}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded ${vulnStatusClass[vuln.status] ?? mutedChip}`}>
                  {vuln.status}
                </span>
              </div>
              <select
                value={vuln.status}
                onChange={(e) => updateVulnStatus(vuln.id, e.target.value)}
                aria-label={`Status for ${vuln.cveId}`}
                className="text-sm border rounded px-2 py-1 bg-background"
              >
                <option value="Active">Active</option>
                <option value="Acknowledged">Acknowledged</option>
                <option value="False Positive">False Positive</option>
                <option value="Mitigated">Mitigated</option>
              </select>
            </div>

            {vuln.description && (
              <p className="text-sm text-foreground/80">{vuln.description}</p>
            )}

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
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

      <AssetFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        asset={assetFormValues}
        onSaved={refreshAsset}
      />
    </div>
  );
}
