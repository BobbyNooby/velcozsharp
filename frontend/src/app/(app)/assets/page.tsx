"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useOrg, useApiFetch, useDebounce } from "@/lib/api";
import { severityColor, criticalityColor, CriticalityBadge } from "@/lib/severity";
import { ExportButton } from "@/components/export-button";
import { Pagination } from "@/components/pagination";
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
import { PageHeader } from "@/components/page-header";

type Asset = {
  id: string;
  name: string;
  description?: string;
  assetTypeName: string;
  departmentName: string;
  status: string;
  criticality: string;
  isCriticalityAuto: boolean;
  tags: string[];
  highestCvssScore?: number;
  highestSeverity?: string;
  lastScannedAt?: string;
  vulnerabilityCount: number;
};

type TagOption = { id: string; name: string };

type Option = { id: string; name: string };

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
  const [criticalityFilter, setCriticalityFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [hasVulnsFilter, setHasVulnsFilter] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");

  const [assetTypes, setAssetTypes] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);

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
      apiFetch("/asset-types?pageSize=100", { signal: controller.signal }),
      apiFetch("/departments?pageSize=100", { signal: controller.signal }),
      apiFetch("/tags", { signal: controller.signal }),
    ])
      .then(async ([atRes, deptRes, tagRes]) => {
        if (!mountedRef.current) return;
        if (atRes.ok) {
          const data = await atRes.json();
          setAssetTypes(data.items ?? []);
        }
        if (deptRes.ok) {
          const data = await deptRes.json();
          setDepartments(data.items ?? []);
        }
        if (tagRes.ok) setTags(await tagRes.json());
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
    if (criticalityFilter && criticalityFilter !== " ") params.set("criticality", criticalityFilter);
    if (tagFilter && tagFilter !== " ") params.set("tag", tagFilter);
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
  }, [orgId, apiFetch, page, pageSize, sortBy, sortOrder, debouncedSearch, statusFilter, assetTypeFilter, departmentFilter, severityFilter, criticalityFilter, tagFilter, hasVulnsFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const stats = {
    total: totalCount,
    withCves: assets.filter((a) => a.vulnerabilityCount > 0).length,
    totalCves: assets.reduce((s, a) => s + a.vulnerabilityCount, 0),
    clean: assets.filter((a) => a.vulnerabilityCount === 0).length,
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <PageHeader
        title="Assets"
        actions={
          <>
            <ExportButton
              basePath="/export/assets"
              params={{
                ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
                ...(statusFilter && statusFilter !== " " ? { status: statusFilter } : {}),
                ...(assetTypeFilter && assetTypeFilter !== " " ? { assetTypeId: assetTypeFilter } : {}),
                ...(departmentFilter && departmentFilter !== " " ? { departmentId: departmentFilter } : {}),
                ...(severityFilter && severityFilter !== " " ? { severity: severityFilter } : {}),
                ...(criticalityFilter && criticalityFilter !== " " ? { criticality: criticalityFilter } : {}),
                ...(tagFilter && tagFilter !== " " ? { tag: tagFilter } : {}),
                ...(hasVulnsFilter && hasVulnsFilter !== " " ? { hasVulnerabilities: hasVulnsFilter } : {}),
              }}
            />
            <Button>
              <Link href="/cve-mapping">Go to Dashboard</Link>
            </Button>
          </>
        }
      />

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
        <Select value={criticalityFilter} onValueChange={(v) => { setCriticalityFilter(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Criticality" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">All Criticality</SelectItem>
            <SelectItem value="Critical">Critical</SelectItem>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tagFilter} onValueChange={(v) => { setTagFilter(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">All Tags</SelectItem>
            {tags.map((t) => (
              <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
            ))}
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
            <SelectItem value="criticality">Criticality</SelectItem>
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
              <TableHead>Criticality</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>CVEs</TableHead>
              <TableHead>Highest</TableHead>
              <TableHead>Last Scanned</TableHead>
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
            {authReady && !loading && assets.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
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
                  <CriticalityBadge criticality={asset.criticality} isAuto={asset.isCriticalityAuto} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {asset.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                    {asset.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">+{asset.tags.length - 3}</Badge>
                    )}
                  </div>
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
                    <Badge className={severityColor(asset.highestSeverity)}>
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
