"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useOrg, useApiFetch, useDebounce } from "@/lib/api";
import { severityClass } from "@/lib/severity";
import { useToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ExportButton } from "@/components/export-button";
import { Pagination } from "@/components/pagination";
import { TableSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

type Vuln = {
  assetId: string;
  assetName: string;
  assetTypeName: string;
  vulnerabilityId: string;
  cveId: string;
  description?: string;
  cvssScore?: number | null; // provided by API when available
  severity?: string; // provided by API when available
  attackVector?: string | null; // provided by API when available
  privilegesRequired?: string;
  userInteraction?: string;
  publishedDate?: string;
  detectedAt: string;
  status: string;
  matchedKeyword?: string;
};

// provided by API when available; used to drive the Active/CRITICAL/HIGH stat cards
type VulnListStats = { active: number; critical: number; high: number };

type VulnsResponse = {
  items?: Vuln[];
  totalCount?: number;
  stats?: VulnListStats; // provided by API when available
};

type Option = { id: string; name: string };

const statusColors: Record<string, string> = {
  Active: "bg-red-500/12 text-red-700 dark:text-red-400 ring-red-500/20 ring-1 ring-inset",
  Acknowledged: "bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-amber-500/20 ring-1 ring-inset",
  "False Positive": "bg-muted text-muted-foreground",
  Mitigated: "bg-green-500/12 text-green-700 dark:text-green-400 ring-green-500/20 ring-1 ring-inset",
};

const bulkStatusTitles: Record<string, string> = {
  Active: "reactivated",
  Acknowledged: "acknowledged",
  Mitigated: "mitigated",
  "False Positive": "marked as false positive",
};

const vectorLabels: Record<string, string> = {
  NETWORK: "Network",
  ADJACENT_NETWORK: "Adjacent",
  LOCAL: "Local",
  PHYSICAL: "Physical",
};

const privilegesLabels: Record<string, string> = {
  NONE: "No privileges",
  LOW: "Low privileges",
  HIGH: "High privileges",
};

const interactionLabels: Record<string, string> = {
  NONE: "No interaction",
  REQUIRED: "User interaction",
};

function formatVector(value?: string | null) {
  if (!value) return "—";
  return vectorLabels[value.toUpperCase()] ?? value;
}

function formatPrivileges(value?: string) {
  if (!value) return null;
  return privilegesLabels[value.toUpperCase()] ?? value;
}

function formatInteraction(value?: string) {
  if (!value) return null;
  return interactionLabels[value.toUpperCase()] ?? value;
}

export default function VulnerabilitiesPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const { addToast } = useToast();
  const mountedRef = useRef(true);

  const [vulns, setVulns] = useState<Vuln[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [serverStats, setServerStats] = useState<VulnListStats | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("");
  const [attackVectorFilter, setAttackVectorFilter] = useState("");
  const [privilegesRequiredFilter, setPrivilegesRequiredFilter] = useState("");
  const [userInteractionFilter, setUserInteractionFilter] = useState("");
  const [sortBy, setSortBy] = useState("cvss");
  const [sortOrder, setSortOrder] = useState("desc");

  const [assetTypes, setAssetTypes] = useState<Option[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch asset types once when org changes
  useEffect(() => {
    if (!orgId) return;
    const controller = new AbortController();

    apiFetch("/asset-types?pageSize=100", { signal: controller.signal })
      .then(async (res) => {
        if (!mountedRef.current) return;
        if (res.ok) {
          const data = await res.json();
          setAssetTypes(data.items ?? []);
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [orgId, apiFetch]);

  // Fetch vulnerabilities when filters/page change (refreshTick forces a refetch)
  useEffect(() => {
    if (!orgId) return;
    const controller = new AbortController();
    setLoading(true);
    setSelectedIds(new Set()); // clear selection on refresh

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (severityFilter && severityFilter !== " ") params.set("severity", severityFilter);
    if (statusFilter && statusFilter !== " ") params.set("status", statusFilter);
    if (assetTypeFilter && assetTypeFilter !== " ") params.set("assetTypeId", assetTypeFilter);
    if (attackVectorFilter && attackVectorFilter !== " ") params.set("attackVector", attackVectorFilter);
    if (privilegesRequiredFilter && privilegesRequiredFilter !== " ") params.set("privilegesRequired", privilegesRequiredFilter);
    if (userInteractionFilter && userInteractionFilter !== " ") params.set("userInteraction", userInteractionFilter);

    apiFetch(`/vulnerabilities?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!mountedRef.current) return;
        if (res.ok) {
          const data: VulnsResponse = await res.json();
          setVulns(data.items ?? []);
          setTotalCount(data.totalCount ?? 0);
          setServerStats(data.stats ?? null); // provided by API when available
          setFetchError(false);
        } else {
          setVulns([]);
          setTotalCount(0);
          setServerStats(null);
          setFetchError(true);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        if (!mountedRef.current) return;
        setVulns([]);
        setTotalCount(0);
        setServerStats(null);
        setFetchError(true);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => controller.abort();
  }, [orgId, apiFetch, page, pageSize, sortBy, sortOrder, debouncedSearch, severityFilter, statusFilter, assetTypeFilter, attackVectorFilter, privilegesRequiredFilter, userInteractionFilter, refreshTick]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Prefer server-side stats when the API provides them; otherwise fall back to
  // counting the current page.
  const stats = {
    total: totalCount,
    active: serverStats
      ? serverStats.active
      : vulns.filter((v) => v.status === "Active").length,
    critical: serverStats
      ? serverStats.critical
      : vulns.filter((v) => (v.severity ?? "").toUpperCase() === "CRITICAL").length,
    high: serverStats
      ? serverStats.high
      : vulns.filter((v) => (v.severity ?? "").toUpperCase() === "HIGH").length,
  };

  const retryFetch = () => {
    setFetchError(false);
    setRefreshTick((t) => t + 1);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === vulns.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(vulns.map((v) => v.vulnerabilityId)));
    }
  };

  const bulkUpdateStatus = async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const count = selectedIds.size;
    try {
      const res = await apiFetch("/vulnerabilities/bulk-status", {
        method: "PATCH",
        body: JSON.stringify({ vulnerabilityIds: Array.from(selectedIds), status: newStatus }),
      });
      if (res.ok) {
        addToast({
          title: `${count} CVE${count === 1 ? "" : "s"} ${bulkStatusTitles[newStatus] ?? `set to ${newStatus}`}`,
          variant: "success",
        });
        setSelectedIds(new Set());
        setRefreshTick((t) => t + 1); // refetch so the new statuses show immediately
      } else {
        let detail: string | undefined;
        try {
          detail = (await res.json())?.message;
        } catch {}
        addToast({ title: "Failed to update CVEs", message: detail, variant: "destructive" });
      }
    } catch {
      addToast({ title: "Failed to update CVEs", message: "Network error", variant: "destructive" });
    }
    if (mountedRef.current) setBulkLoading(false);
  };

  const updateSingleStatus = async (vulnId: string, newStatus: string) => {
    try {
      const res = await apiFetch("/vulnerabilities/bulk-status", {
        method: "PATCH",
        body: JSON.stringify({ vulnerabilityIds: [vulnId], status: newStatus }),
      });
      if (res.ok && mountedRef.current) {
        setVulns((prev) =>
          prev.map((v) => (v.vulnerabilityId === vulnId ? { ...v, status: newStatus } : v))
        );
      } else if (mountedRef.current) {
        addToast({ title: "Failed to update status", variant: "destructive" });
      }
    } catch {
      if (mountedRef.current) {
        addToast({ title: "Failed to update status", message: "Network error", variant: "destructive" });
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <PageHeader
        title="Vulnerabilities"
        actions={
          <>
            <ExportButton
              basePath="/export/vulnerabilities"
              params={{
                ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
                ...(severityFilter && severityFilter !== " " ? { severity: severityFilter } : {}),
                ...(statusFilter && statusFilter !== " " ? { status: statusFilter } : {}),
                ...(assetTypeFilter && assetTypeFilter !== " " ? { assetTypeId: assetTypeFilter } : {}),
                ...(attackVectorFilter && attackVectorFilter !== " " ? { attackVector: attackVectorFilter } : {}),
                ...(privilegesRequiredFilter && privilegesRequiredFilter !== " " ? { privilegesRequired: privilegesRequiredFilter } : {}),
                ...(userInteractionFilter && userInteractionFilter !== " " ? { userInteraction: userInteractionFilter } : {}),
              }}
            />
            <Button>
              <Link href="/cve-mapping">Run a Scan</Link>
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total CVEs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">CRITICAL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{stats.critical}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">HIGH</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.high}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search CVE ID or description..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">All Severities</SelectItem>
            <SelectItem value="CRITICAL">CRITICAL</SelectItem>
            <SelectItem value="HIGH">HIGH</SelectItem>
            <SelectItem value="MEDIUM">MEDIUM</SelectItem>
            <SelectItem value="LOW">LOW</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Acknowledged">Acknowledged</SelectItem>
            <SelectItem value="False Positive">False Positive</SelectItem>
            <SelectItem value="Mitigated">Mitigated</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assetTypeFilter} onValueChange={(v) => { setAssetTypeFilter(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Asset Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">All Types</SelectItem>
            {assetTypes.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={attackVectorFilter} onValueChange={(v) => { setAttackVectorFilter(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Attack Vector" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">All Vectors</SelectItem>
            <SelectItem value="NETWORK">Network</SelectItem>
            <SelectItem value="ADJACENT_NETWORK">Adjacent</SelectItem>
            <SelectItem value="LOCAL">Local</SelectItem>
            <SelectItem value="PHYSICAL">Physical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={privilegesRequiredFilter} onValueChange={(v) => { setPrivilegesRequiredFilter(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Privileges" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">All Privileges</SelectItem>
            <SelectItem value="NONE">None</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userInteractionFilter} onValueChange={(v) => { setUserInteractionFilter(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Interaction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">All Interactions</SelectItem>
            <SelectItem value="NONE">None</SelectItem>
            <SelectItem value="REQUIRED">Required</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => { setSortBy(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="severity">Severity</SelectItem>
            <SelectItem value="cvss">CVSS</SelectItem>
            <SelectItem value="detected">Detected</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="cveid">CVE ID</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}>
          {sortOrder === "asc" ? "ASC" : "DESC"}
        </Button>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 bg-muted p-2 rounded-md">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus("Acknowledged")} disabled={bulkLoading}>
            Acknowledge
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus("Mitigated")} disabled={bulkLoading}>
            Mitigate
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus("False Positive")} disabled={bulkLoading}>
            False Positive
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      {loading || !authReady ? (
        <TableSkeleton rows={8} columns={6} />
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={vulns.length > 0 && selectedIds.size === vulns.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all visible CVEs"
                  />
                </TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>CVE ID</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>CVSS</TableHead>
                <TableHead>Vector</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detected</TableHead>
                <TableHead>Published</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fetchError && (
                <TableRow>
                  <TableCell colSpan={10}>
                    <div className="flex items-center justify-center gap-3 py-6">
                      <span className="text-sm text-red-600 dark:text-red-400">
                        Failed to load vulnerabilities
                      </span>
                      <Button size="sm" variant="outline" onClick={retryFetch}>
                        Retry
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!fetchError && vulns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No vulnerabilities found
                  </TableCell>
                </TableRow>
              )}
              {vulns.map((v) => (
                <TableRow key={v.vulnerabilityId}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(v.vulnerabilityId)}
                      onCheckedChange={() => toggleSelect(v.vulnerabilityId)}
                      aria-label={`Select ${v.cveId}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Link href={`/assets/${v.assetId}`} className="font-medium hover:underline block">
                      {v.assetName}
                    </Link>
                    <span className="text-xs text-muted-foreground">{v.assetTypeName}</span>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{v.cveId}</TableCell>
                  <TableCell>
                    {v.severity ? (
                      <Badge className={cn(severityClass(v.severity), "ring-1 ring-inset")}>{v.severity}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{v.cvssScore ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {v.attackVector ? (
                      <div className="space-y-0.5">
                        <div>{formatVector(v.attackVector)}</div>
                        {v.privilegesRequired && <div>{formatPrivileges(v.privilegesRequired)}</div>}
                        {v.userInteraction && <div>{formatInteraction(v.userInteraction)}</div>}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[v.status] ?? ""}>{v.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(v.detectedAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {v.publishedDate ? formatDate(v.publishedDate) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Select value={v.status} onValueChange={(s) => s && updateSingleStatus(v.vulnerabilityId, s)}>
                      <SelectTrigger className="w-[130px] h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Acknowledged">Acknowledged</SelectItem>
                        <SelectItem value="False Positive">False Positive</SelectItem>
                        <SelectItem value="Mitigated">Mitigated</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {vulns.length} of {totalCount} CVEs
        </div>
        <div className="flex items-center gap-2">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-[100px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
