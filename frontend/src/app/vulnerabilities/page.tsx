"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useCurrentOrgId, useApiFetch } from "@/lib/api";
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

export default function VulnerabilitiesPage() {
  const orgId = useCurrentOrgId();
  const apiFetch = useApiFetch(orgId);

  const [vulns, setVulns] = useState<Vuln[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("cvss");
  const [sortOrder, setSortOrder] = useState("desc");

  const [assetTypes, setAssetTypes] = useState<Option[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchFilters = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await apiFetch("/asset-types");
      if (res.ok) setAssetTypes(await res.json());
    } catch {}
  }, [orgId, apiFetch]);

  const fetchVulns = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      if (search.trim()) params.set("search", search.trim());
      if (severityFilter) params.set("severity", severityFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (assetTypeFilter) params.set("assetTypeId", assetTypeFilter);

      const res = await apiFetch(`/vulnerabilities?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVulns(data.items ?? []);
        setTotalCount(data.totalCount ?? 0);
      }
    } catch {}
    setLoading(false);
  }, [orgId, apiFetch, page, pageSize, sortBy, sortOrder, search, severityFilter, statusFilter, assetTypeFilter]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    fetchVulns();
  }, [fetchVulns]);

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
      if (res.ok) {
        setSelectedIds(new Set());
        await fetchVulns();
      }
    } catch {}
    setBulkLoading(false);
  };

  const updateSingleStatus = async (vulnId: string, newStatus: string) => {
    // We need assetId for the single PATCH endpoint, but we don't have a direct single endpoint in VulnerabilitiesController
    // For simplicity, we'll use bulk with a single ID
    try {
      const res = await apiFetch("/vulnerabilities/bulk-status", {
        method: "PATCH",
        body: JSON.stringify({ vulnerabilityIds: [vulnId], status: newStatus }),
      });
      if (res.ok) await fetchVulns();
    } catch {}
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Vulnerabilities</h1>
        <Button>
          <Link href="/cve-mapping">Go to Dashboard</Link>
        </Button>
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
              <TableHead>Status</TableHead>
              <TableHead>Detected</TableHead>
              <TableHead>Published</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {!loading && vulns.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
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
