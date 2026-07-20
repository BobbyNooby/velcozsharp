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

type Department = {
  id: string;
  name: string;
  isActive: boolean;
};

export default function DepartmentsPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [showInactive, setShowInactive] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchDepartments = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (showInactive) params.set("includeInactive", "true");
      const res = await apiFetch(`/departments?${params.toString()}`);
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setDepartments(data.items ?? []);
        setTotalCount(data.totalCount ?? 0);
      }
    } catch {} finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, [orgId, apiFetch, page, pageSize, debouncedSearch, showInactive]);

  if (!authReady) return <div className="max-w-7xl mx-auto p-6">Loading...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Departments</h1>
          <p className="text-sm text-muted-foreground">Manage organization departments</p>
        </div>
      </div>

      {message && <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm">{message}</div>}

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input placeholder="Search departments..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showInactive} onChange={(e) => { setShowInactive(e.target.checked); setPage(1); }} />
          Show inactive
        </label>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Departments</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : departments.length === 0 ? (
            <div className="text-muted-foreground">No departments found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.name}</TableCell>
                    <TableCell>{d.isActive ? "Active" : "Inactive"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Showing {departments.length} of {totalCount}</div>
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
