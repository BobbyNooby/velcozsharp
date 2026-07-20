"use client";

import { useState, useEffect, useRef } from "react";
import { useOrg, useApiFetch } from "@/lib/api";
import { ExportButton } from "@/components/export-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { cn } from "@/lib/utils";

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

export default function ScanSchedulesPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [schedules, setSchedules] = useState<ScanSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formCron, setFormCron] = useState("0 2 * * *");
  const [formPreset, setFormPreset] = useState("0 2 * * *");
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchSchedules = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await apiFetch("/scan-schedules");
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setSchedules(data);
      }
    } catch {} finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [orgId, apiFetch]);

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setFormName("");
    setFormCron("0 2 * * *");
    setFormPreset("0 2 * * *");
  };

  const startEdit = (s: ScanSchedule) => {
    setEditId(s.id);
    setFormName(s.name);
    setFormCron(s.cronExpression);
    setFormPreset(s.cronExpression);
    setShowForm(true);
  };

  const save = async () => {
    if (!formName.trim()) { setMessage("Name is required"); return; }

    const body = { name: formName, cronExpression: formCron, scope: "All" };

    try {
      let res;
      if (editId) {
        res = await apiFetch(`/scan-schedules/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await apiFetch("/scan-schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (res.ok && mountedRef.current) {
        setMessage(editId ? "Schedule updated" : "Schedule created");
        resetForm();
        fetchSchedules();
      } else {
        const err = await res.json();
        setMessage(err.message ?? "Failed to save");
      }
    } catch {
      setMessage("Network error");
    }
  };

  const toggleEnabled = async (s: ScanSchedule) => {
    try {
      const res = await apiFetch(`/scan-schedules/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      if (res.ok) fetchSchedules();
    } catch {}
  };

  const deleteSchedule = async (id: string) => {
    try {
      const res = await apiFetch(`/scan-schedules/${id}`, { method: "DELETE" });
      if (res.ok && mountedRef.current) {
        setMessage("Schedule deleted");
        fetchSchedules();
      }
    } catch {}
  };

  const onPresetChange = (value: string) => {
    setFormPreset(value);
    if (value !== "custom") {
      setFormCron(value);
    }
  };

  if (!authReady) return <div className="max-w-7xl mx-auto p-6">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Scan Schedules</h1>
          <p className="text-sm text-gray-600">Configure recurring scans</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton basePath="/export/scan-jobs" />
          <Button onClick={() => { resetForm(); setShowForm(true); }}>New Schedule</Button>
        </div>
      </div>

      {message && (
        <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm">{message}</div>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editId ? "Edit Schedule" : "New Schedule"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="border rounded px-2 py-1 text-sm w-full"
                placeholder="Daily Production Scan"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Frequency</label>
              <select
                value={formPreset}
                onChange={(e) => onPresetChange(e.target.value)}
                className="border rounded px-2 py-1 text-sm w-full"
              >
                {CRON_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {formPreset === "custom" && (
                <input
                  type="text"
                  value={formCron}
                  onChange={(e) => setFormCron(e.target.value)}
                  className="border rounded px-2 py-1 text-sm w-full mt-1 font-mono"
                  placeholder="0 2 * * *"
                />
              )}
              <div className="text-xs text-gray-500 mt-1">
                Cron expression: minute hour day month weekday
                {formPreset !== "custom" && <span className="ml-2 font-mono">{formCron}</span>}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Scope</label>
              <input
                type="text"
                value="All Assets"
                disabled
                className="border rounded px-2 py-1 text-sm w-full bg-gray-50 text-gray-500"
              />
              <input type="hidden" value="All" />
            </div>
            <div className="flex gap-2">
              <Button onClick={save}>{editId ? "Update" : "Create"}</Button>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schedules list */}
      {loading ? (
        <div className="text-gray-500">Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
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
                      <Badge className={s.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                        {s.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Badge className="bg-blue-100 text-blue-700">{SCOPE_LABELS[s.scope] ?? s.scope}</Badge>
                    </div>
                    <div className="text-sm text-gray-500">
                      <span className="font-mono">{s.cronExpression}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      Created: {new Date(s.createdAt).toLocaleDateString()}
                      {s.lastRunAt && <> | Last run: {new Date(s.lastRunAt).toLocaleString()}</>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => startEdit(s)}>Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => toggleEnabled(s)}>
                      {s.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600" onClick={() => deleteSchedule(s.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
