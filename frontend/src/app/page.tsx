"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useOrg, useApiFetch } from "@/lib/api";
import { useJobs } from "@/lib/jobs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DashboardStats = {
  totalAssets: number;
  totalVulnerabilities: number;
  activeVulnerabilities: number;
  severityBreakdown: Record<string, number>;
  highestRiskAssets: Array<{
    id: string;
    name: string;
    assetTypeName: string;
    highestCvssScore?: number;
    highestSeverity?: string;
    vulnerabilityCount: number;
  }>;
  recentScanActivity: Array<{
    assetId: string;
    assetName: string;
    lastScannedAt?: string;
    vulnerabilitiesFound: number;
  }>;
};

const severityColors: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-blue-100 text-blue-700",
};

export default function DashboardPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const { activeJobs, trackJob } = useJobs();
  const mountedRef = useRef(true);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [departmentBreakdown, setDepartmentBreakdown] = useState<Record<string, number>>({});
  const [assetTypeBreakdown, setAssetTypeBreakdown] = useState<Record<string, number>>({});
  const [jobSummary, setJobSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!orgId) return;
    const controller = new AbortController();
    setLoading(true);

    Promise.all([
      apiFetch("/dashboard/stats", { signal: controller.signal }),
      apiFetch("/dashboard/department-breakdown", { signal: controller.signal }),
      apiFetch("/dashboard/asset-type-breakdown", { signal: controller.signal }),
      apiFetch("/scan/jobs/summary", { signal: controller.signal }),
    ])
      .then(async ([statsRes, deptRes, typeRes, jobsRes]) => {
        if (!mountedRef.current) return;
        if (statsRes.ok) setStats(await statsRes.json());
        if (deptRes.ok) setDepartmentBreakdown(await deptRes.json());
        if (typeRes.ok) setAssetTypeBreakdown(await typeRes.json());
        if (jobsRes.ok) setJobSummary(await jobsRes.json());
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => controller.abort();
  }, [orgId, apiFetch]);

  const scanAll = async () => {
    setMessage("Queueing scan all assets...");
    try {
      const res = await apiFetch("/scan/assets/all", { method: "POST" });
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        trackJob(data.jobId);
        setMessage(`Scan job ${data.jobId.slice(0, 8)} queued (${data.totalAssets} assets)`);
      }
    } catch {
      if (mountedRef.current) setMessage("Scan failed");
    }
  };

  // Refresh dashboard stats when active jobs complete
  useEffect(() => {
    if (activeJobs.length === 0) {
      Promise.all([
        apiFetch("/dashboard/stats"),
        apiFetch("/dashboard/department-breakdown"),
        apiFetch("/dashboard/asset-type-breakdown"),
        apiFetch("/scan/jobs/summary"),
      ]).then(async ([statsRes, deptRes, typeRes, jobsRes]) => {
        if (!mountedRef.current) return;
        if (statsRes.ok) setStats(await statsRes.json());
        if (deptRes.ok) setDepartmentBreakdown(await deptRes.json());
        if (typeRes.ok) setAssetTypeBreakdown(await typeRes.json());
        if (jobsRes.ok) setJobSummary(await jobsRes.json());
        setMessage("");
      });
    }
  }, [activeJobs.length, apiFetch]);

  if (loading || !authReady) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-red-600">Failed to load dashboard</div>
      </div>
    );
  }

  const severityEntries = Object.entries(stats.severityBreakdown).sort(
    ([a], [b]) => {
      const order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (order[b as keyof typeof order] ?? 0) - (order[a as keyof typeof order] ?? 0);
    }
  );

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-600">Organization overview</p>
        </div>
        <div className="flex gap-2">
          <Link href="/assets" className={cn(buttonVariants({ variant: "outline" }))}>View Assets</Link>
          <Link href="/vulnerabilities" className={cn(buttonVariants({ variant: "outline" }))}>View CVEs</Link>
          <Button onClick={scanAll} disabled={activeJobs.length > 0} className="bg-red-600 hover:bg-red-700">
            {activeJobs.length > 0 ? `${activeJobs.length} Job(s) Running...` : "Scan All Assets"}
          </Button>
        </div>
      </div>

      {message && (
        <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm">{message}</div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalAssets}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total CVEs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.totalVulnerabilities}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active CVEs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats.activeVulnerabilities}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scan Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1 text-xs">
              {Object.entries(jobSummary).sort().map(([status, count]) => (
                <Badge key={status} variant="outline">{status}: {count}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Severity Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {severityEntries.length === 0 && <span className="text-sm text-gray-400">None</span>}
              {severityEntries.map(([severity, count]) => (
                <Badge key={severity} className={severityColors[severity] ?? "bg-gray-100 text-gray-700"}>
                  {severity}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Assets by Department</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {Object.entries(departmentBreakdown).length === 0 && <span className="text-sm text-gray-400">None</span>}
              {Object.entries(departmentBreakdown).map(([dept, count]) => (
                <div key={dept} className="flex justify-between text-sm">
                  <span>{dept}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Assets by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {Object.entries(assetTypeBreakdown).length === 0 && <span className="text-sm text-gray-400">None</span>}
              {Object.entries(assetTypeBreakdown).map(([type, count]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span>{type}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Highest Risk Assets */}
        <Card>
          <CardHeader>
            <CardTitle>Highest Risk Assets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.highestRiskAssets.length === 0 && (
              <div className="text-sm text-gray-500">No assets with CVEs found</div>
            )}
            {stats.highestRiskAssets.map((asset) => (
              <div key={asset.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                <div>
                  <Link href={`/assets/${asset.id}`} className="font-medium hover:underline">
                    {asset.name}
                  </Link>
                  <div className="text-xs text-gray-500">{asset.assetTypeName}</div>
                </div>
                <div className="text-right">
                  {asset.highestSeverity && (
                    <Badge className={severityColors[asset.highestSeverity.toUpperCase()] ?? ""}>
                      {asset.highestSeverity} {asset.highestCvssScore}
                    </Badge>
                  )}
                  <div className="text-xs text-gray-500 mt-1">{asset.vulnerabilityCount} CVE(s)</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Scan Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Scan Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.recentScanActivity.length === 0 && (
              <div className="text-sm text-gray-500">No scans yet</div>
            )}
            {stats.recentScanActivity.map((scan) => (
              <div key={scan.assetId} className="flex justify-between items-center border-b pb-2 last:border-0">
                <div>
                  <Link href={`/assets/${scan.assetId}`} className="font-medium hover:underline">
                    {scan.assetName}
                  </Link>
                  <div className="text-xs text-gray-500">
                    {scan.lastScannedAt
                      ? new Date(scan.lastScannedAt).toLocaleString()
                      : "Never"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-red-600">{scan.vulnerabilitiesFound} CVE(s)</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/assets" className={cn(buttonVariants({ variant: "default" }))}>Manage Assets</Link>
          <Link href="/vulnerabilities" className={cn(buttonVariants({ variant: "outline" }))}>Triage CVEs</Link>
          <Link href="/cve-mapping" className={cn(buttonVariants({ variant: "outline" }))}>CVE Mapping</Link>
          <Link href="/auth-test" className={cn(buttonVariants({ variant: "outline" }))}>Dev Tools</Link>
        </CardContent>
      </Card>
    </div>
  );
}
