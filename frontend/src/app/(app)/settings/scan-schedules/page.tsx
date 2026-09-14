"use client";

import { useState, useEffect, useRef } from "react";
import { useOrg, useApiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { ExportButton } from "@/components/export-button";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/skeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

type ScanSchedule = {
  id: string;
  name: string;
  cronExpression: string;
  scope: string;
  targetAssetIds?: string[];
  enabled: boolean;
  lastRunAt?: string;
  createdAt: string;
};

const SCOPE_LABELS: Record<string, string> = {
  All: "All Assets",
};

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at 02:00", value: "0 2 * * *" },
  { label: "Daily at 14:00", value: "0 14 * * *" },
  { label: "Weekly (Mon 02:00)", value: "0 2 * * 1" },
  { label: "Monthly (1st 02:00)", value: "0 2 1 * *" },
  { label: "Custom", value: "custom" },
];

const CONFIRM_DISARM_MS = 3000;

async function getApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.message || fallback;
  } catch {
    return fallback;
  }
}

export default function ScanSchedulesPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const { addToast } = useToast();
  const mountedRef = useRef(true);

  const [schedules, setSchedules] = useState<ScanSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formCron, setFormCron] = useState("0 2 * * *");
  const [formPreset, setFormPreset] = useState("0 2 * * *");
  const [nameError, setNameError] = useState("");
  const [cronError, setCronError] = useState("");
  const [saving, setSaving] = useState(false);

  // Two-step delete confirm
  const [deleteArmId, setDeleteArmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, []);

  const fetchSchedules = async (signal?: AbortSignal) => {
    if (!orgId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await apiFetch(`/scan-schedules?${params.toString()}`, { signal });
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setSchedules(data.items ?? []);
        setTotalCount(data.totalCount ?? 0);
      } else if (!res.ok && mountedRef.current) {
        setError("Failed to load scan schedules.");
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (mountedRef.current) setError("Failed to load scan schedules.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchSchedules(controller.signal);
    return () => controller.abort();
  }, [orgId, apiFetch, page, pageSize]);

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setFormName("");
    setFormCron("0 2 * * *");
    setFormPreset("0 2 * * *");
    setNameError("");
    setCronError("");
  };

  const startEdit = (s: ScanSchedule) => {
    setEditId(s.id);
    setFormName(s.name);
    setFormCron(s.cronExpression);
    setFormPreset(s.cronExpression);
    setNameError("");
    setCronError("");
    setShowForm(true);
  };

  const validateCron = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return "Cron expression is required";
    if (trimmed.split(/\s+/).length !== 5) {
      return "Cron expression must have 5 space-separated fields (minute hour day month weekday)";
    }
    return "";
  };

  const save = async () => {
    const nameErr = !formName.trim() ? "Name is required" : "";
    const cronErr = validateCron(formCron);
    setNameError(nameErr);
    setCronError(cronErr);
    if (nameErr || cronErr) return;

    const body = { name: formName, cronExpression: formCron.trim(), scope: "All" };

    setSaving(true);
    try {
      let res;
      if (editId) {
        res = await apiFetch(`/scan-schedules/${editId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        res = await apiFetch("/scan-schedules", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }

      if (res.ok && mountedRef.current) {
        addToast({
          title: editId ? "Schedule updated" : "Schedule created",
          variant: "success",
        });
        resetForm();
        fetchSchedules();
      } else if (mountedRef.current) {
        addToast({
          title: await getApiError(res, "Failed to save schedule"),
          variant: "destructive",
        });
      }
    } catch {
      if (mountedRef.current) addToast({ title: "Network error", variant: "destructive" });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const toggleEnabled = async (s: ScanSchedule) => {
    try {
      const res = await apiFetch(`/scan-schedules/${s.id}/toggle`, { method: "POST" });
      if (res.ok) {
        if (mountedRef.current) fetchSchedules();
      } else {
        addToast({
          title: await getApiError(res, "Failed to update schedule"),
          variant: "destructive",
        });
      }
    } catch {
      addToast({ title: "Network error", variant: "destructive" });
    }
  };

  const runNow = async (s: ScanSchedule) => {
    try {
      const res = await apiFetch(`/scan-schedules/${s.id}/run-now`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        addToast({ title: data.message ?? "Scan job queued", variant: "success" });
      } else {
        addToast({ title: data.message ?? "Failed to run schedule", variant: "destructive" });
      }
    } catch {
      addToast({ title: "Network error", variant: "destructive" });
    }
  };

  const disarmDelete = () => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = null;
    setDeleteArmId(null);
  };

  const handleDeleteClick = (id: string) => {
    if (deleteArmId === id) {
      deleteSchedule(id);
      return;
    }
    disarmDelete();
    setDeleteArmId(id);
    armTimerRef.current = setTimeout(disarmDelete, CONFIRM_DISARM_MS);
  };

  const deleteSchedule = async (id: string) => {
    disarmDelete();
    setDeletingId(id);
    try {
      const res = await apiFetch(`/scan-schedules/${id}`, { method: "DELETE" });
      if (res.ok && mountedRef.current) {
        addToast({ title: "Schedule deleted", variant: "success" });
        fetchSchedules();
      } else if (mountedRef.current) {
        addToast({
          title: await getApiError(res, "Failed to delete schedule"),
          variant: "destructive",
        });
      }
    } catch {
      if (mountedRef.current) addToast({ title: "Network error", variant: "destructive" });
    } finally {
      if (mountedRef.current) setDeletingId(null);
    }
  };

  const onPresetChange = (value: string) => {
    setFormPreset(value);
    if (value !== "custom") {
      setFormCron(value);
      setCronError("");
    }
  };

  if (!authReady) return <div className="max-w-7xl mx-auto p-6">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <PageHeader
        title="Scan Schedules"
        description="Configure recurring scans"
        actions={
          <>
            <ExportButton basePath="/export/scan-jobs" />
            <Button onClick={() => { resetForm(); setShowForm(true); }}>New Schedule</Button>
          </>
        }
      />

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editId ? "Edit Schedule" : "New Schedule"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="schedule-name">Name</Label>
              <Input
                id="schedule-name"
                value={formName}
                onChange={(e) => { setFormName(e.target.value); setNameError(""); }}
                placeholder="Daily Production Scan"
                disabled={saving}
              />
              {nameError && <p className="text-sm text-destructive">{nameError}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="schedule-frequency">Frequency</Label>
              <Select value={formPreset} onValueChange={(v) => onPresetChange(v ?? "custom")}>
                <SelectTrigger id="schedule-frequency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRON_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formPreset === "custom" && (
                <Input
                  aria-label="Custom cron expression"
                  value={formCron}
                  onChange={(e) => { setFormCron(e.target.value); setCronError(""); }}
                  className="mt-1 font-mono"
                  placeholder="0 2 * * *"
                  disabled={saving}
                />
              )}
              <div className="text-xs text-muted-foreground mt-1">
                Cron expression, e.g. 0 2 * * * (daily at 2 AM)
                {formPreset !== "custom" && <span className="ml-2 font-mono">{formCron}</span>}
              </div>
              {cronError && <p className="text-sm text-destructive">{cronError}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="schedule-scope">Scope</Label>
              <Input
                id="schedule-scope"
                value="All Assets"
                disabled
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                {editId ? "Update" : "Create"}
              </Button>
              <Button variant="outline" onClick={resetForm} disabled={saving}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schedules list */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-14 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => fetchSchedules()}>Retry</Button>
        </div>
      ) : schedules.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No scan schedules configured. Create one to automatically scan your assets.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <Badge className={s.enabled ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-muted text-muted-foreground"}>
                        {s.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">{SCOPE_LABELS[s.scope] ?? s.scope}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-mono">{s.cronExpression}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created: {new Date(s.createdAt).toLocaleDateString()}
                      {s.lastRunAt && <> | Last run: {new Date(s.lastRunAt).toLocaleString()}</>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" onClick={() => runNow(s)}>Run Now</Button>
                    <Button variant="outline" size="sm" onClick={() => startEdit(s)}>Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => toggleEnabled(s)}>
                      {s.enabled ? "Disable" : "Enable"}
                    </Button>
                    {deleteArmId === s.id ? (
                      <Button variant="destructive" size="sm" onClick={() => handleDeleteClick(s.id)} disabled={deletingId === s.id}>
                        {deletingId === s.id && <Loader2 className="mr-1 size-3 animate-spin" />}
                        Click again to permanently delete
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleDeleteClick(s.id)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {schedules.length} of {totalCount} schedules
          </div>
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
      )}
    </div>
  );
}
