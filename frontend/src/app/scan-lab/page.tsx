"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useOrg, useApiFetch } from "@/lib/api";
import { useJobs } from "@/lib/jobs";
import { useSignalR } from "@/lib/signalr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Zap,
  Brain,
  Play,
  RefreshCw,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Scan,
  ChevronRight,
  Radio,
} from "lucide-react";

type Asset = {
  id: string;
  name: string;
  assetTypeName?: string;
  criticality?: string;
  exposure?: string;
  properties?: Record<string, any>;
  lastScannedAt?: string;
  vulnerabilityCount?: number;
};

type LiveProgress = {
  jobId: string;
  processedAssets: number;
  totalAssets: number;
  currentAssetName?: string;
  currentChunk: number;
  totalChunks: number;
  newVulnerabilitiesFound: number;
  stage?: string;
  status: "Queued" | "Running" | "Completed" | "Failed";
  useAi?: boolean;
  updatedAt: number;
};

type LogEvent = {
  id: string;
  time: string;
  jobId: string;
  stage?: string;
  message: string;
  type: "info" | "success" | "error" | "progress";
};

const statusColors: Record<string, string> = {
  Queued: "bg-yellow-100 text-yellow-700",
  Running: "bg-blue-100 text-blue-700",
  Completed: "bg-green-100 text-green-700",
  Failed: "bg-red-100 text-red-700",
};

const stageDisplay: Record<string, string> = {
  "": "Starting",
  "queued": "Queued",
  "keywords": "AI keyword suggestions",
  "nvd": "Querying NVD",
  "ai-score": "AI scoring CVEs",
  "scoring": "Scoring CVEs",
  "persist": "Saving results",
  "Completed": "Completed",
};

export default function ScanLabPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const { jobs, activeJobs, refresh: refreshJobs } = useJobs();
  const { connected } = useSignalR();
  const mountedRef = useRef(true);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [useAi, setUseAi] = useState(true);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveProgress, setLiveProgress] = useState<Record<string, LiveProgress>>({});
  const [eventLog, setEventLog] = useState<LogEvent[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch assets
  useEffect(() => {
    if (!orgId) return;
    apiFetch("/assets?pageSize=200").then(async (res) => {
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setAssets(data.items ?? []);
      }
    });
  }, [orgId, apiFetch]);

  // Listen to SignalR ScanProgress events
  useEffect(() => {
    const handler = (e: any) => {
      const p = e?.detail;
      if (!p?.jobId) return;

      const progress: LiveProgress = {
        jobId: p.jobId,
        processedAssets: p.processedAssets ?? 0,
        totalAssets: p.totalAssets ?? 0,
        currentAssetName: p.currentAssetName,
        currentChunk: p.currentChunk ?? 0,
        totalChunks: p.totalChunks ?? 0,
        newVulnerabilitiesFound: p.newVulnerabilitiesFound ?? 0,
        stage: p.stage,
        status: p.status || "Running",
        useAi: p.useAi,
        updatedAt: Date.now(),
      };

      setLiveProgress((prev) => ({
        ...prev,
        [p.jobId]: progress,
      }));

      const stageName = stageDisplay[p.stage || ""] || p.stage || "Progress update";
      const logMessage = p.status === "Completed"
        ? `Scan completed — ${p.processedAssets}/${p.totalAssets} assets, ${p.newVulnerabilitiesFound ?? 0} CVEs found`
        : p.status === "Failed"
        ? `Scan failed`
        : `${stageName} — ${p.currentAssetName || p.processedAssets + "/" + p.totalAssets}`;

      addLogEvent({
        jobId: p.jobId,
        stage: p.stage,
        message: logMessage,
        type: p.status === "Completed" ? "success" : p.status === "Failed" ? "error" : "progress",
      });
    };

    window.addEventListener("velcoz:scan-progress", handler);
    return () => window.removeEventListener("velcoz:scan-progress", handler);
  }, []);

  // Merge polled jobs with live progress
  const mergedJobs = useMemo(() => {
    const map = new Map<string, LiveProgress & { type?: string; createdAt?: string; completedAt?: string }>();

    for (const job of jobs) {
      map.set(job.id, {
        jobId: job.id,
        processedAssets: job.processedAssets,
        totalAssets: job.totalAssets,
        currentAssetName: job.currentAssetName,
        currentChunk: 0,
        totalChunks: 0,
        newVulnerabilitiesFound: job.newVulnerabilitiesFound,
        stage: undefined,
        status: job.status,
        useAi: job.useAi,
        updatedAt: 0,
        type: job.type,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      });
    }

    for (const [jobId, live] of Object.entries(liveProgress)) {
      const existing = map.get(jobId);
      if (existing && live.updatedAt > 0) {
        map.set(jobId, { ...existing, ...live });
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => (b.updatedAt || new Date(b.createdAt || 0).getTime()) - (a.updatedAt || new Date(a.createdAt || 0).getTime())
    );
  }, [jobs, liveProgress]);

  const addLogEvent = useCallback((evt: Omit<LogEvent, "id" | "time">) => {
    if (!mountedRef.current) return;
    setEventLog((prev) => [
      {
        ...evt,
        id: Math.random().toString(36).slice(2),
        time: new Date().toLocaleTimeString(),
      },
      ...prev.slice(0, 99),
    ]);
  }, []);

  const scanAll = async () => {
    setLoading(true);
    setMessage(`Queueing ${useAi ? "AI deep" : "fast regex"} scan for all assets...`);
    try {
      const res = await apiFetch(`/scan/assets/all?useAi=${useAi}`, { method: "POST" });
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setMessage(`Job ${data.jobId.slice(0, 8)} queued (${data.totalAssets} assets)`);
        refreshJobs();
      }
    } catch {
      if (mountedRef.current) setMessage("Scan failed");
    }
    setLoading(false);
  };

  const scanSelected = async () => {
    if (selectedAssets.size === 0) {
      setMessage("Select at least one asset");
      return;
    }
    setLoading(true);
    setMessage(`Queueing ${useAi ? "AI deep" : "fast regex"} scan for ${selectedAssets.size} asset(s)...`);
    try {
      const res = await apiFetch(`/scan/assets/bulk?useAi=${useAi}`, {
        method: "POST",
        body: JSON.stringify({ assetIds: Array.from(selectedAssets) }),
      });
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setMessage(`Bulk job ${data.jobId.slice(0, 8)} queued (${data.totalAssets} assets)`);
        refreshJobs();
      }
    } catch {
      if (mountedRef.current) setMessage("Bulk scan failed");
    }
    setLoading(false);
  };

  const scanSingle = async (assetId: string) => {
    try {
      const res = await apiFetch(`/scan/assets/${assetId}?useAi=${useAi}`, { method: "POST" });
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setMessage(`Single scan ${data.jobId.slice(0, 8)} queued`);
        refreshJobs();
      }
    } catch {
      if (mountedRef.current) setMessage("Single scan failed");
    }
  };

  const toggleAsset = (assetId: string) => {
    setSelectedAssets((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedAssets(new Set(assets.map((a) => a.id)));
  };

  const clearSelection = () => {
    setSelectedAssets(new Set());
  };

  const clearLog = () => setEventLog([]);

  if (!authReady) {
    return <div className="max-w-7xl mx-auto p-6">Loading auth...</div>;
  }

  const runningJobs = mergedJobs.filter((j) => j.status === "Running" || j.status === "Queued");
  const completedJobs = mergedJobs.filter((j) => j.status === "Completed" || j.status === "Failed");

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">Scan Lab</h1>
            <Badge variant="outline" className="gap-1">
              <Radio className="w-3 h-3" />
              {connected ? "SignalR live" : "polling"}
            </Badge>
          </div>
          <p className="text-sm text-gray-600">
            Watch scans progress in real-time. AI deep scans use LLM keyword + scoring; fast scans use regex.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
          <button
            onClick={() => setUseAi(false)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              !useAi ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className="w-4 h-4" />
            Fast Regex
          </button>
          <button
            onClick={() => setUseAi(true)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              useAi ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Brain className="w-4 h-4" />
            AI Deep
          </button>
        </div>
      </div>

      {message && (
        <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm">{message}</div>
      )}

      {/* Live Monitor */}
      {runningJobs.length > 0 && (
        <div className="space-y-4">
          {runningJobs.map((job) => {
            const pct = job.totalAssets > 0 ? Math.round((job.processedAssets / job.totalAssets) * 100) : 0;
            const isAi = job.stage && (job.stage.includes("keywords") || job.stage.includes("ai-score") || job.stage.includes("nvd"));
            return (
              <Card key={job.jobId} className="border-blue-200 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-blue-600 animate-pulse" />
                      <CardTitle className="text-base">
                        Live Scan — {job.type} ({job.jobId.slice(0, 8)})
                      </CardTitle>
                      <Badge variant="outline" className="text-xs gap-1">
                        {job.useAi ? <Brain className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                        {job.useAi ? "AI" : "Fast"}
                      </Badge>
                    </div>
                    <Badge className={statusColors[job.status]}>{job.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-muted rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">Assets</div>
                      <div className="text-xl font-semibold">
                        {job.processedAssets} <span className="text-sm text-gray-400">/ {job.totalAssets}</span>
                      </div>
                    </div>
                    <div className="bg-muted rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">CVEs Found</div>
                      <div className="text-xl font-semibold text-orange-600">
                        {job.newVulnerabilitiesFound}
                      </div>
                    </div>
                    <div className="bg-muted rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">Current Stage</div>
                      <div className="text-sm font-semibold truncate">
                        {stageDisplay[job.stage || ""] || job.stage || "Scanning"}
                      </div>
                    </div>
                    <div className="bg-muted rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">Current Asset</div>
                      <div className="text-sm font-semibold truncate">
                        {job.currentAssetName || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Overall progress</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all duration-500 ease-out rounded-full",
                          isAi ? "bg-purple-500" : "bg-blue-500"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {job.totalChunks > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Scan className="w-3 h-3" />
                      AI chunk {job.currentChunk} / {job.totalChunks}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={scanAll}
              disabled={loading || activeJobs.length > 0}
              className={cn("gap-2", useAi ? "bg-purple-600 hover:bg-purple-700" : "bg-red-600 hover:bg-red-700")}
            >
              <Play className="w-4 h-4" />
              {activeJobs.length > 0 ? "Scan Running..." : `Scan All Assets (${useAi ? "AI" : "Fast"})`}
            </Button>
            <Button
              onClick={scanSelected}
              disabled={loading || selectedAssets.size === 0 || activeJobs.length > 0}
              variant="outline"
              className="gap-2"
            >
              <Scan className="w-4 h-4" />
              Scan Selected ({selectedAssets.size})
            </Button>
            <Button onClick={refreshJobs} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            {selectedAssets.size > 0 ? (
              <button onClick={clearSelection} className="text-blue-600 hover:underline">
                Clear selection
              </button>
            ) : (
              <button onClick={selectAll} className="text-blue-600 hover:underline">
                Select all assets
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assets */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assets ({assets.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {assets.length === 0 ? (
                <div className="text-sm text-gray-500">No assets found. Go to <Link href="/assets" className="text-blue-600 hover:underline">Assets</Link> to add some.</div>
              ) : (
                <div className="space-y-2">
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      className={cn(
                        "border rounded-lg p-3 flex items-center gap-3 transition-colors",
                        selectedAssets.has(asset.id) ? "bg-blue-50 border-blue-200" : "hover:bg-gray-50"
                      )}
                    >
                      <Checkbox
                        checked={selectedAssets.has(asset.id)}
                        onCheckedChange={() => toggleAsset(asset.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={`/assets/${asset.id}`} className="font-medium hover:underline truncate">
                            {asset.name}
                          </Link>
                          {asset.assetTypeName && (
                            <Badge variant="outline" className="text-xs">{asset.assetTypeName}</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {asset.lastScannedAt
                            ? `Last scanned ${new Date(asset.lastScannedAt).toLocaleString()}`
                            : "Never scanned"}
                          {asset.vulnerabilityCount !== undefined && (
                            <span className="ml-2">
                              • {asset.vulnerabilityCount} CVE{asset.vulnerabilityCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loading || activeJobs.length > 0}
                        onClick={() => scanSingle(asset.id)}
                        className="shrink-0"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Completed Jobs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Jobs ({completedJobs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {completedJobs.length === 0 ? (
                <div className="text-sm text-gray-500">No completed jobs yet</div>
              ) : (
                <div className="space-y-2">
                  {completedJobs.slice(0, 10).map((job) => (
                    <div key={job.jobId} className="border rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {job.status === "Completed" ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                          )}
                          {job.type} Scan
                          <Badge className={statusColors[job.status] ?? "bg-gray-100"}>{job.status}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {job.processedAssets}/{job.totalAssets} assets • {job.newVulnerabilitiesFound} CVEs
                          {job.completedAt && ` • ${new Date(job.completedAt).toLocaleString()}`}
                        </div>
                      </div>
                      <div className="text-xs font-mono text-gray-400">{job.jobId.slice(0, 8)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Event Log */}
        <div>
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Live Event Log
              </CardTitle>
              <button onClick={clearLog} className="text-xs text-muted-foreground hover:text-foreground">
                Clear
              </button>
            </CardHeader>
            <CardContent>
              {eventLog.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-8">
                  <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  Start a scan to see live updates
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {eventLog.map((evt) => (
                    <div key={evt.id} className="text-sm border-l-2 pl-3 py-1">
                      <div className="text-xs text-muted-foreground">{evt.time}</div>
                      <div
                        className={cn(
                          "font-medium",
                          evt.type === "success" && "text-green-600",
                          evt.type === "error" && "text-red-600",
                          evt.type === "progress" && "text-blue-600",
                          evt.type === "info" && "text-foreground"
                        )}
                      >
                        {evt.message}
                      </div>
                      <div className="text-xs text-gray-400">job {evt.jobId.slice(0, 8)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
