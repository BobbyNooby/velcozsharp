"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useOrg, useApiFetch, useDebounce } from "@/lib/api";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

type Asset = {
  id: string;
  name: string;
  description?: string;
  assetTypeName: string;
  departmentName: string;
  status: string;
  highestCvssScore?: number;
  highestSeverity?: string;
  lastScannedAt?: string;
  vulnerabilityCount: number;
};

type Option = { id: string; name: string };

const severityColors: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 hover:bg-red-100",
  HIGH: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  MEDIUM: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  LOW: "bg-blue-100 text-blue-700 hover:bg-blue-100",
};

export default function AssetsPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [hasVulnsFilter, setHasVulnsFilter] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");

  const [assetTypes, setAssetTypes] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch filter options once when org changes
  useEffect(() => {
    if (!orgId) return;
    const controller = new AbortController();

    Promise.all([
      apiFetch("/asset-types", { signal: controller.signal }),
      apiFetch("/departments", { signal: controller.signal }),
    ])
      .then(async ([atRes, deptRes]) => {
        if (!mountedRef.current) return;
        if (atRes.ok) setAssetTypes(await atRes.json());
        if (deptRes.ok) setDepartments(await deptRes.json());
      })
      .catch(() => {});

    return () => controller.abort();
  }, [orgId, apiFetch]);

  // Fetch assets when filters/page change
  useEffect(() => {
    if (!orgId) return;
    const controller = new AbortController();
    setLoading(true);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (statusFilter && statusFilter !== " ") params.set("status", statusFilter);
    if (assetTypeFilter && assetTypeFilter !== " ") params.set("assetTypeId", assetTypeFilter);
    if (departmentFilter && departmentFilter !== " ") params.set("departmentId", departmentFilter);
    if (severityFilter && severityFilter !== " ") params.set("severity", severityFilter);
    if (hasVulnsFilter && hasVulnsFilter !== " ") params.set("hasVulnerabilities", hasVulnsFilter);

    apiFetch(`/assets?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!mountedRef.current) return;
        if (res.ok) {
          const data = await res.json();
          setAssets(data.items ?? []);
          setTotalCount(data.totalCount ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => controller.abort();
  }, [orgId, apiFetch, page, pageSize, sortBy, sortOrder, debouncedSearch, statusFilter, assetTypeFilter, departmentFilter, severityFilter, hasVulnsFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const stats = {
    total: totalCount,
    withCves: assets.filter((a) => a.vulnerabilityCount > 0).length,
    totalCves: assets.reduce((s, a) => s + a.vulnerabilityCount, 0),
    clean: assets.filter((a) => a.vulnerabilityCount === 0).length,
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Assets</h1>
        <div className="flex items-center gap-2">
          <ExportButton
            basePath="/export/assets"
            params={{
              ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
              ...(statusFilter && statusFilter !== " " ? { status: statusFilter } : {}),
              ...(assetTypeFilter && assetTypeFilter !== " " ? { assetTypeId: assetTypeFilter } : {}),
              ...(departmentFilter && departmentFilter !== " " ? { departmentId: departmentFilter } : {}),
              ...(severityFilter && severityFilter !== " " ? { severity: severityFilter } : {}),
              ...(hasVulnsFilter && hasVulnsFilter !== " " ? { hasVulnerabilities: hasVulnsFilter } : {}),
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">With CVEs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.withCves}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total CVEs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.totalCves}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clean</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.clean}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search assets..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Retired">Retired</SelectItem>
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
        <Select value={departmentFilter} onValueChange={(v) => { setDepartmentFilter(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">All Depts</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Select value={hasVulnsFilter} onValueChange={(v) => { setHasVulnsFilter(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Has CVEs?" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">All</SelectItem>
            <SelectItem value="true">Has CVEs</SelectItem>
            <SelectItem value="false">No CVEs</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => { setSortBy(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt">Created</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="cvss">CVSS</SelectItem>
            <SelectItem value="vulnCount">CVE Count</SelectItem>
            <SelectItem value="lastScanned">Last Scanned</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}>
          {sortOrder === "asc" ? "ASC" : "DESC"}
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>CVEs</TableHead>
              <TableHead>Highest</TableHead>
              <TableHead>Last Scanned</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(loading || !authReady) && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {authReady && !loading && assets.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No assets found
                </TableCell>
              </TableRow>
            )}
            {assets.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell>
                  <Link href={`/assets/${asset.id}`} className="font-medium hover:underline">
                    {asset.name}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{asset.assetTypeName}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{asset.departmentName}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{asset.status}</Badge>
                </TableCell>
                <TableCell>
                  {asset.vulnerabilityCount > 0 ? (
                    <span className="text-red-600 font-medium">{asset.vulnerabilityCount}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell>
                  {asset.highestSeverity ? (
                    <Badge className={severityColors[asset.highestSeverity.toUpperCase()] ?? ""}>
                      {asset.highestSeverity} {asset.highestCvssScore}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {asset.lastScannedAt ? new Date(asset.lastScannedAt).toLocaleDateString() : "Never"}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline">
                    <Link href={`/assets/${asset.id}`}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {assets.length} of {totalCount} assets
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
