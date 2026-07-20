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
import { RotateCcw } from "lucide-react";

type AssetType = {
  id: string;
  name: string;
  description?: string;
  iconName?: string;
  isActive: boolean;
  fields: { name: string; dataType: string; isRequired: boolean }[];
};

export default function AssetTypesPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [types, setTypes] = useState<AssetType[]>([]);
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

  const fetchTypes = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (showInactive) params.set("includeInactive", "true");
      const res = await apiFetch(`/asset-types?${params.toString()}`);
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setTypes(data.items ?? []);
        setTotalCount(data.totalCount ?? 0);
      }
    } catch {} finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchTypes();
  }, [orgId, apiFetch, page, pageSize, debouncedSearch, showInactive]);

  const reactivate = async (id: string) => {
    const res = await apiFetch(`/asset-types/${id}/reactivate`, { method: "POST" });
    if (res.ok) {
      setMessage("Asset type reactivated.");
      fetchTypes();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.message || "Failed to reactivate asset type.");
    }
  };

  if (!authReady) return <div className="max-w-7xl mx-auto p-6">Loading...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Asset Types</h1>
        <p className="text-sm text-muted-foreground">Manage asset type definitions</p>
      </div>

      {message && <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm">{message}</div>}

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input placeholder="Search asset types..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showInactive} onChange={(e) => { setShowInactive(e.target.checked); setPage(1); }} />
          Show inactive
        </label>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Asset Types</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : types.length === 0 ? (
            <div className="text-muted-foreground">No asset types found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Fields</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.fields.map((f) => f.name).join(", ")}</TableCell>
                    <TableCell>{t.isActive ? "Active" : "Inactive"}</TableCell>
                    <TableCell>
                      {!t.isActive && (
                        <Button variant="outline" size="sm" onClick={() => reactivate(t.id)}>
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
        <div className="text-sm text-muted-foreground">Showing {types.length} of {totalCount}</div>
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
