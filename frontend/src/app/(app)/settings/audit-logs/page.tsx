"use client";

import { useEffect, useRef, useState } from "react";
import { useOrg, useApiFetch, useDebounce } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchLogs = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (actionFilter.trim()) params.set("action", actionFilter.trim());
      if (entityTypeFilter.trim()) params.set("entityType", entityTypeFilter.trim());
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to).toISOString());
      const res = await apiFetch(`/audit-logs?${params.toString()}`);
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setLogs(data.items ?? []);
        setTotalCount(data.totalCount ?? 0);
      }
    } catch {} finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [orgId, apiFetch, page, pageSize, actionFilter, entityTypeFilter, from, to]);

  if (!authReady) return <div className="max-w-7xl mx-auto p-6">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Track changes across the organization</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <Input placeholder="Action" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className="w-[150px]" />
        <Input placeholder="Entity Type" value={entityTypeFilter} onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }} className="w-[150px]" />
        <div className="text-sm">
          <label className="block text-xs text-muted-foreground">From</label>
          <input type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="border rounded px-2 py-1" />
        </div>
        <div className="text-sm">
          <label className="block text-xs text-muted-foreground">To</label>
          <input type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="border rounded px-2 py-1" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit Logs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="text-muted-foreground">No audit logs found</div>
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
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
          <span className="text-sm">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="border rounded px-2 py-1 text-sm">
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>
    </div>
  );
}
