"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useOrg, useApiFetch, useDebounce } from "@/lib/api";
import { ExportButton } from "@/components/export-button";
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

type Vuln = {
  assetId: string;
  assetName: string;
  assetTypeName: string;
  vulnerabilityId: string;
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

type Option = { id: string; name: string };

const severityColors: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 hover:bg-red-100",
  HIGH: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  MEDIUM: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  LOW: "bg-blue-100 text-blue-700 hover:bg-blue-100",
};

const statusColors: Record<string, string> = {
  Active: "bg-red-100 text-red-700 hover:bg-red-100",
  Acknowledged: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  "False Positive": "bg-gray-100 text-gray-700 hover:bg-gray-100",
  Mitigated: "bg-green-100 text-green-700 hover:bg-green-100",
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

function formatVector(value?: string) {
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
  const mountedRef = useRef(true);

  const [vulns, setVulns] = useState<Vuln[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

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

  // Fetch vulnerabilities when filters/page change
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
          const data = await res.json();
          setVulns(data.items ?? []);
          setTotalCount(data.totalCount ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => controller.abort();
  }, [orgId, apiFetch, page, pageSize, sortBy, sortOrder, debouncedSearch, severityFilter, statusFilter, assetTypeFilter, attackVectorFilter, privilegesRequiredFilter, userInteractionFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const stats = {
    total: totalCount,
    active: vulns.filter((v) => v.status === "Active").length,
    critical: vulns.filter((v) => v.severity === "CRITICAL").length,
    high: vulns.filter((v) => v.severity === "HIGH").length,
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
    try {
      const res = await apiFetch("/vulnerabilities/bulk-status", {
        method: "PATCH",
        body: JSON.stringify({ vulnerabilityIds: Array.from(selectedIds), status: newStatus }),
      });
      if (res.ok && mountedRef.current) {
        setSelectedIds(new Set());
        // Trigger refresh by bumping a dummy state or just re-fetch
        // We'll force a re-fetch by resetting page to same value (useEffect will run)
        setPage((p) => p);
      }
    } catch {}
    setBulkLoading(false);
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
      }
    } catch {}
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Vulnerabilities</h1>
        <div className="flex items-center gap-2">
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
            <Link href="/cve-mapping">Go to Dashboard</Link>
          </Button>
        </div>
      </div>

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
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={vulns.length > 0 && selectedIds.size === vulns.length}
                  onCheckedChange={toggleSelectAll}
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
            {(loading || !authReady) && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {authReady && !loading && vulns.length === 0 && (
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
                    <Badge className={severityColors[v.severity.toUpperCase()] ?? ""}>{v.severity}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>{v.cvssScore ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {v.attackVector ? (
                    <div className="space-y-0.5">
                      <div>{formatVector(v.attackVector)}</div>
                      {v.privilegesRequired && <div className="text-gray-500">{formatPrivileges(v.privilegesRequired)}</div>}
                      {v.userInteraction && <div className="text-gray-500">{formatInteraction(v.userInteraction)}</div>}
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={statusColors[v.status] ?? ""}>{v.status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(v.detectedAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {v.publishedDate ? new Date(v.publishedDate).toLocaleDateString() : "—"}
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

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {vulns.length} of {totalCount} CVEs
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Previous
          </Button>
          <span className="text-sm">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next
          </Button>
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
