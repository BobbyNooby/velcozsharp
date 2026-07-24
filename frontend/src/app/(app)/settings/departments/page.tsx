"use client";

import { useEffect, useRef, useState } from "react";
import { useOrg, useApiFetch, useDebounce } from "@/lib/api";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/page-header";

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

  const fetchDepartments = async (signal?: AbortSignal) => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (showInactive) params.set("includeInactive", "true");
      const res = await apiFetch(`/departments?${params.toString()}`, { signal });
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setDepartments(data.items ?? []);
        setTotalCount(data.totalCount ?? 0);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchDepartments(controller.signal);
    return () => controller.abort();
  }, [orgId, apiFetch, page, pageSize, debouncedSearch, showInactive]);

  const reactivate = async (id: string) => {
    const res = await apiFetch(`/departments/${id}/reactivate`, { method: "POST" });
    if (res.ok) {
      setMessage("Department reactivated.");
      fetchDepartments();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.message || "Failed to reactivate department.");
    }
  };

  if (!authReady) return <div className="max-w-7xl mx-auto p-6">Loading...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <PageHeader
        title="Departments"
        description="Manage organization departments"
      />

      {message && <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm">{message}</div>}

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input placeholder="Search departments..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="showInactive" checked={showInactive} onCheckedChange={(checked) => { setShowInactive(checked === true); setPage(1); }} />
          <Label htmlFor="showInactive" className="text-sm font-normal cursor-pointer">Show inactive</Label>
        </div>
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
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.name}</TableCell>
                    <TableCell>{d.isActive ? "Active" : "Inactive"}</TableCell>
                    <TableCell>
                      {!d.isActive && (
                        <Button variant="outline" size="sm" onClick={() => reactivate(d.id)}>
                          <RotateCcw className="w-4 h-4 mr-1" /> Reactivate
                        </Button>
                      )}
                    </TableCell>
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
