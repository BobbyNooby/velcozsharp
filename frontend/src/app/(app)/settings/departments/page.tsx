"use client";

import { useEffect, useRef, useState } from "react";
import { useOrg, useApiFetch, useDebounce } from "@/lib/api";
import { useToast } from "@/lib/toast";
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
import { Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/skeletons";

type Department = {
  id: string;
  name: string;
  isActive: boolean;
};

const CONFIRM_DISARM_MS = 3000;

async function getApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.message || fallback;
  } catch {
    return fallback;
  }
}

export default function DepartmentsPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const { addToast } = useToast();
  const mountedRef = useRef(true);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [showInactive, setShowInactive] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  // Create form
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Inline rename
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState("");
  const [renaming, setRenaming] = useState(false);

  // Two-step delete confirm
  const [deleteArmId, setDeleteArmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, []);

  const fetchDepartments = async (signal?: AbortSignal) => {
    if (!orgId) return;
    setLoading(true);
    setError("");
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
      } else if (!res.ok && mountedRef.current) {
        setError("Failed to load departments.");
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (mountedRef.current) setError("Failed to load departments.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchDepartments(controller.signal);
    return () => controller.abort();
  }, [orgId, apiFetch, page, pageSize, debouncedSearch, showInactive]);

  const disarmDelete = () => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = null;
    setDeleteArmId(null);
  };

  const handleDeleteClick = (id: string) => {
    if (deleteArmId === id) {
      deleteDepartment(id);
      return;
    }
    disarmDelete();
    setDeleteArmId(id);
    armTimerRef.current = setTimeout(disarmDelete, CONFIRM_DISARM_MS);
  };

  const deleteDepartment = async (id: string) => {
    disarmDelete();
    setDeletingId(id);
    try {
      const res = await apiFetch(`/departments/${id}`, { method: "DELETE" });
      if (res.ok) {
        addToast({ title: "Department deleted", variant: "success" });
        if (mountedRef.current) fetchDepartments();
      } else {
        addToast({
          title: await getApiError(res, "Failed to delete department."),
          variant: "destructive",
        });
      }
    } catch {
      addToast({ title: "Network error", variant: "destructive" });
    } finally {
      if (mountedRef.current) setDeletingId(null);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setCreateError("Name is required");
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch("/departments", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        addToast({ title: "Department created", variant: "success" });
        setNewName("");
        setCreateError("");
        if (mountedRef.current) fetchDepartments();
      } else {
        addToast({
          title: await getApiError(res, "Failed to create department."),
          variant: "destructive",
        });
      }
    } catch {
      addToast({ title: "Network error", variant: "destructive" });
    } finally {
      if (mountedRef.current) setCreating(false);
    }
  };

  const startEdit = (d: Department) => {
    setEditingId(d.id);
    setEditName(d.name);
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editName.trim()) {
      setEditError("Name is required");
      return;
    }
    setRenaming(true);
    try {
      const res = await apiFetch(`/departments/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        addToast({ title: "Department renamed", variant: "success" });
        cancelEdit();
        if (mountedRef.current) fetchDepartments();
      } else {
        addToast({
          title: await getApiError(res, "Failed to rename department."),
          variant: "destructive",
        });
      }
    } catch {
      addToast({ title: "Network error", variant: "destructive" });
    } finally {
      if (mountedRef.current) setRenaming(false);
    }
  };

  const reactivate = async (id: string) => {
    try {
      const res = await apiFetch(`/departments/${id}/reactivate`, { method: "POST" });
      if (res.ok) {
        addToast({ title: "Department reactivated", variant: "success" });
        if (mountedRef.current) fetchDepartments();
      } else {
        addToast({
          title: await getApiError(res, "Failed to reactivate department."),
          variant: "destructive",
        });
      }
    } catch {
      addToast({ title: "Network error", variant: "destructive" });
    }
  };

  if (!authReady) return <div className="max-w-7xl mx-auto p-6">Loading...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <PageHeader
        title="Departments"
        description="Manage organization departments"
      />

      <Card>
        <CardHeader>
          <CardTitle>Add Department</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} noValidate className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px] space-y-1">
              <Label htmlFor="new-department-name">Name</Label>
              <Input
                id="new-department-name"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setCreateError(""); }}
                placeholder="e.g. Engineering"
                disabled={creating}
              />
              {createError && <p className="text-sm text-destructive">{createError}</p>}
            </div>
            <Button type="submit" disabled={creating}>
              {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
              Add Department
            </Button>
          </form>
        </CardContent>
      </Card>

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
            <TableSkeleton rows={5} columns={3} />
          ) : error ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => fetchDepartments()}>Retry</Button>
            </div>
          ) : departments.length === 0 ? (
            <div className="text-muted-foreground">No departments found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-64">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      {editingId === d.id ? (
                        <div className="space-y-1">
                          <Input
                            aria-label="Department name"
                            value={editName}
                            onChange={(e) => { setEditName(e.target.value); setEditError(""); }}
                            disabled={renaming}
                            autoFocus
                          />
                          {editError && <p className="text-sm text-destructive">{editError}</p>}
                        </div>
                      ) : (
                        d.name
                      )}
                    </TableCell>
                    <TableCell>{d.isActive ? "Active" : "Inactive"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {editingId === d.id ? (
                          <>
                            <Button size="sm" onClick={saveEdit} disabled={renaming}>
                              {renaming && <Loader2 className="mr-1 size-3 animate-spin" />} Save
                            </Button>
                            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={renaming}>
                              <X className="w-4 h-4 mr-1" /> Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="outline" size="sm" onClick={() => startEdit(d)}>
                              <Pencil className="w-4 h-4 mr-1" /> Rename
                            </Button>
                            {d.isActive && (
                              deleteArmId === d.id ? (
                                <Button variant="destructive" size="sm" onClick={() => handleDeleteClick(d.id)} disabled={deletingId === d.id}>
                                  {deletingId === d.id && <Loader2 className="mr-1 size-3 animate-spin" />} Confirm delete?
                                </Button>
                              ) : (
                                <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleDeleteClick(d.id)}>
                                  Delete
                                </Button>
                              )
                            )}
                            {!d.isActive && (
                              <Button variant="outline" size="sm" onClick={() => reactivate(d.id)}>
                                <RotateCcw className="w-4 h-4 mr-1" /> Reactivate
                              </Button>
                            )}
                          </>
                        )}
                      </div>
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
