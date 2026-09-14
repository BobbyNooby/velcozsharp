"use client";

import { useEffect, useRef, useState } from "react";
import { useOrg, useApiFetch, useDebounce } from "@/lib/api";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/skeletons";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  changedByUserId?: string;
  timestamp: string;
  beforeJson?: string;
  afterJson?: string;
};

export default function AuditLogsPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasFilters = Boolean(actionFilter || entityTypeFilter || from || to);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchLogs = async (signal?: AbortSignal) => {
    if (!orgId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (actionFilter.trim()) params.set("action", actionFilter.trim());
      if (entityTypeFilter.trim()) params.set("entityType", entityTypeFilter.trim());
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to).toISOString());
      const res = await apiFetch(`/audit-logs?${params.toString()}`, { signal });
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setLogs(data.items ?? []);
        setTotalCount(data.totalCount ?? 0);
      } else if (!res.ok && mountedRef.current) {
        setError("Failed to load audit logs.");
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (mountedRef.current) setError("Failed to load audit logs.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchLogs(controller.signal);
    return () => controller.abort();
  }, [orgId, apiFetch, page, pageSize, actionFilter, entityTypeFilter, from, to]);

  if (!authReady) return <div className="max-w-7xl mx-auto p-6">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Track changes across the organization"
      />

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label htmlFor="filter-action" className="text-xs text-muted-foreground">Action</Label>
          <Input id="filter-action" placeholder="Action" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-entity-type" className="text-xs text-muted-foreground">Entity Type</Label>
          <Input id="filter-entity-type" placeholder="Entity Type" value={entityTypeFilter} onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-from" className="text-xs text-muted-foreground">From</Label>
          <Input id="filter-from" type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-to" className="text-xs text-muted-foreground">To</Label>
          <Input id="filter-to" type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit Logs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={5} columns={5} />
          ) : error ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => fetchLogs()}>Retry</Button>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <ScrollText className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {hasFilters ? "No audit entries match these filters" : "No audit entries yet"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>Changed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">{new Date(l.timestamp).toLocaleString()}</TableCell>
                    <TableCell>{l.action}</TableCell>
                    <TableCell>{l.entityType}</TableCell>
                    <TableCell className="font-mono text-xs">{l.entityId}</TableCell>
                    <TableCell className="font-mono text-xs">{l.changedByUserId ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Showing {logs.length} of {totalCount}</div>
        <div className="flex items-center gap-2">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-[80px]">
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
