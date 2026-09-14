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
import { Loader2, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/skeletons";

type AssetTypeFieldDef = {
  id?: string;
  name: string;
  dataType: string;
  isRequired: boolean;
  isCveSearchable: boolean;
  displayOrder: number;
  defaultValue?: string | null;
};

type AssetType = {
  id: string;
  name: string;
  description?: string | null;
  iconName?: string | null;
  isActive: boolean;
  fields: AssetTypeFieldDef[];
};

// Editable row in the field-definitions editor (displayOrder is derived from row index).
type FieldRow = {
  name: string;
  dataType: string;
  isRequired: boolean;
  isCveSearchable: boolean;
  defaultValue: string;
};

const DATA_TYPES = ["text", "number", "boolean", "date"];
const CONFIRM_DISARM_MS = 3000;

const emptyFieldRow = (): FieldRow => ({
  name: "",
  dataType: "text",
  isRequired: false,
  isCveSearchable: true,
  defaultValue: "",
});

async function getApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.message || fallback;
  } catch {
    return fallback;
  }
}

export default function AssetTypesPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const { addToast } = useToast();
  const mountedRef = useRef(true);

  const [types, setTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [showInactive, setShowInactive] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  // Create / edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIconName, setFormIconName] = useState("");
  const [formFields, setFormFields] = useState<FieldRow[]>([emptyFieldRow()]);
  const [nameError, setNameError] = useState("");
  const [fieldsError, setFieldsError] = useState("");
  const [saving, setSaving] = useState(false);

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

  const fetchTypes = async (signal?: AbortSignal) => {
    if (!orgId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (showInactive) params.set("includeInactive", "true");
      const res = await apiFetch(`/asset-types?${params.toString()}`, { signal });
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setTypes(data.items ?? []);
        setTotalCount(data.totalCount ?? 0);
      } else if (!res.ok && mountedRef.current) {
        setError("Failed to load asset types.");
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (mountedRef.current) setError("Failed to load asset types.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchTypes(controller.signal);
    return () => controller.abort();
  }, [orgId, apiFetch, page, pageSize, debouncedSearch, showInactive]);

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormName("");
    setFormDescription("");
    setFormIconName("");
    setFormFields([emptyFieldRow()]);
    setNameError("");
    setFieldsError("");
  };

  const openCreate = () => {
    closeForm();
    setFormOpen(true);
  };

  const openEdit = (t: AssetType) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormDescription(t.description ?? "");
    setFormIconName(t.iconName ?? "");
    setFormFields(
      t.fields.length > 0
        ? t.fields.map((f) => ({
            name: f.name,
            dataType: f.dataType,
            isRequired: f.isRequired,
            isCveSearchable: f.isCveSearchable,
            defaultValue: f.defaultValue ?? "",
          }))
        : [emptyFieldRow()]
    );
    setNameError("");
    setFieldsError("");
    setFormOpen(true);
  };

  const updateFieldRow = (idx: number, patch: Partial<FieldRow>) => {
    setFormFields((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim();
    const namedRows = formFields.filter((r) => r.name.trim());
    if (!trimmedName) {
      setNameError("Name is required");
      return;
    }
    if (namedRows.length !== formFields.length) {
      setFieldsError("Every field definition needs a name (remove empty rows).");
      return;
    }
    setFieldsError("");

    const body = {
      name: trimmedName,
      description: formDescription.trim() || null,
      iconName: formIconName.trim() || null,
      fields: namedRows.map((r, i) => ({
        name: r.name.trim(),
        dataType: r.dataType,
        isRequired: r.isRequired,
        isCveSearchable: r.isCveSearchable,
        displayOrder: i,
        defaultValue: r.defaultValue.trim() || null,
      })),
    };

    setSaving(true);
    try {
      const res = editingId
        ? await apiFetch(`/asset-types/${editingId}`, { method: "PUT", body: JSON.stringify(body) })
        : await apiFetch("/asset-types", { method: "POST", body: JSON.stringify(body) });
      if (res.ok) {
        addToast({
          title: editingId ? "Asset type updated" : "Asset type created",
          variant: "success",
        });
        closeForm();
        if (mountedRef.current) fetchTypes();
      } else {
        addToast({
          title: await getApiError(res, editingId ? "Failed to update asset type." : "Failed to create asset type."),
          variant: "destructive",
        });
      }
    } catch {
      addToast({ title: "Network error", variant: "destructive" });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const disarmDelete = () => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = null;
    setDeleteArmId(null);
  };

  const handleDeleteClick = (id: string) => {
    if (deleteArmId === id) {
      deleteType(id);
      return;
    }
    disarmDelete();
    setDeleteArmId(id);
    armTimerRef.current = setTimeout(disarmDelete, CONFIRM_DISARM_MS);
  };

  const deleteType = async (id: string) => {
    disarmDelete();
    setDeletingId(id);
    try {
      const res = await apiFetch(`/asset-types/${id}`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({
          title: "Asset type deleted",
          message: data.message,
          variant: "success",
        });
        if (mountedRef.current) fetchTypes();
      } else {
        addToast({
          title: await getApiError(res, "Failed to delete asset type."),
          variant: "destructive",
        });
      }
    } catch {
      addToast({ title: "Network error", variant: "destructive" });
    } finally {
      if (mountedRef.current) setDeletingId(null);
    }
  };

  const reactivate = async (id: string) => {
    try {
      const res = await apiFetch(`/asset-types/${id}/reactivate`, { method: "POST" });
      if (res.ok) {
        addToast({ title: "Asset type reactivated", variant: "success" });
        if (mountedRef.current) fetchTypes();
      } else {
        addToast({
          title: await getApiError(res, "Failed to reactivate asset type."),
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
        title="Asset Types"
        description="Manage asset type definitions"
        actions={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Add Asset Type
          </Button>
        }
      />

      {formOpen && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Edit Asset Type" : "Add Asset Type"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} noValidate className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="asset-type-name">Name</Label>
                  <Input
                    id="asset-type-name"
                    value={formName}
                    onChange={(e) => { setFormName(e.target.value); setNameError(""); }}
                    placeholder="e.g. Database Server"
                    disabled={saving}
                  />
                  {nameError && <p className="text-sm text-destructive">{nameError}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="asset-type-description">Description</Label>
                  <Input
                    id="asset-type-description"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Optional"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="asset-type-icon">Icon name</Label>
                  <Input
                    id="asset-type-icon"
                    value={formIconName}
                    onChange={(e) => setFormIconName(e.target.value)}
                    placeholder="Optional, e.g. server"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Field definitions</Label>
                <p className="text-xs text-muted-foreground">
                  Custom properties captured for assets of this type, saved in the order listed.
                </p>
                {fieldsError && <p className="text-sm text-destructive">{fieldsError}</p>}
                <div className="space-y-2">
                  {formFields.map((row, idx) => (
                    <div
                      key={idx}
                      className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_120px_140px_minmax(0,1fr)_auto]"
                    >
                      <Input
                        aria-label={`Field ${idx + 1} name`}
                        value={row.name}
                        onChange={(e) => updateFieldRow(idx, { name: e.target.value })}
                        placeholder={`Field ${idx + 1} name`}
                        disabled={saving}
                      />
                      <Select
                        value={row.dataType}
                        onValueChange={(v) => updateFieldRow(idx, { dataType: v ?? "text" })}
                      >
                        <SelectTrigger aria-label={`Field ${idx + 1} data type`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DATA_TYPES.map((dt) => (
                            <SelectItem key={dt} value={dt}>{dt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`field-${idx}-required`}
                          checked={row.isRequired}
                          onCheckedChange={(checked) => updateFieldRow(idx, { isRequired: checked === true })}
                          disabled={saving}
                        />
                        <Label htmlFor={`field-${idx}-required`} className="text-sm font-normal cursor-pointer">Required</Label>
                        <Checkbox
                          id={`field-${idx}-cve`}
                          checked={row.isCveSearchable}
                          onCheckedChange={(checked) => updateFieldRow(idx, { isCveSearchable: checked === true })}
                          disabled={saving}
                        />
                        <Label htmlFor={`field-${idx}-cve`} className="text-sm font-normal cursor-pointer">CVE searchable</Label>
                      </div>
                      <Input
                        aria-label={`Field ${idx + 1} default value`}
                        value={row.defaultValue}
                        onChange={(e) => updateFieldRow(idx, { defaultValue: e.target.value })}
                        placeholder="Default value (optional)"
                        disabled={saving}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Remove field ${idx + 1}`}
                        onClick={() => setFormFields((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={saving}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormFields((prev) => [...prev, emptyFieldRow()])}
                  disabled={saving}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add field
                </Button>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {editingId ? "Save Changes" : "Create Asset Type"}
                </Button>
                <Button type="button" variant="outline" onClick={closeForm} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input placeholder="Search asset types..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="showInactive" checked={showInactive} onCheckedChange={(checked) => { setShowInactive(checked === true); setPage(1); }} />
          <Label htmlFor="showInactive" className="text-sm font-normal cursor-pointer">Show inactive</Label>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Asset Types</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={5} columns={4} />
          ) : error ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => fetchTypes()}>Retry</Button>
            </div>
          ) : types.length === 0 ? (
            <div className="text-muted-foreground">No asset types found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Fields</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-56">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.fields.map((f) => f.name).join(", ")}</TableCell>
                    <TableCell>{t.isActive ? "Active" : "Inactive"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {t.isActive ? (
                          <>
                            <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                              <Pencil className="w-4 h-4 mr-1" /> Edit
                            </Button>
                            {deleteArmId === t.id ? (
                              <Button variant="destructive" size="sm" onClick={() => handleDeleteClick(t.id)} disabled={deletingId === t.id}>
                                {deletingId === t.id && <Loader2 className="mr-1 size-3 animate-spin" />} Confirm delete?
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleDeleteClick(t.id)}>
                                Delete
                              </Button>
                            )}
                          </>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => reactivate(t.id)}>
                            <RotateCcw className="w-4 h-4 mr-1" /> Reactivate
                          </Button>
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
        <div className="text-sm text-muted-foreground">Showing {types.length} of {totalCount}</div>
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
