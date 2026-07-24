"use client";

import { useState, useEffect, useRef } from "react";
import { useOrg, useApiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";

type OrgDetails = {
  id: string;
  name: string;
  description?: string;
};

export default function GeneralSettingsPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [org, setOrg] = useState<OrgDetails | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!orgId) return () => controller.abort();
    setLoading(true);
    apiFetch(`/organizations/${orgId}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.ok && mountedRef.current) {
          const data = await res.json();
          setOrg(data);
          setName(data.name ?? "");
          setDescription(data.description ?? "");
        }
      })
      .catch((err: any) => {
        if (err?.name === "AbortError") return;
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => controller.abort();
  }, [orgId, apiFetch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !org) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await apiFetch(`/organizations/${orgId}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          description: description || null,
          nvdApiKey: null, // leave unchanged
          isAiEnabled: false, // leave unchanged
        }),
      });
      if (res.ok && mountedRef.current) {
        setMessage("Organization settings saved.");
      } else if (mountedRef.current) {
        const err = await res.text();
        setMessage(`Save failed: ${err}`);
      }
    } catch {
      if (mountedRef.current) setMessage("Save failed.");
    }
    setSaving(false);
  };

  if (loading || !authReady) {
    return <div className="text-muted-foreground">Loading organization...</div>;
  }

  if (!org) {
    return <div className="text-red-600">Failed to load organization.</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Settings"
        description="Manage your organization name and description."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization Details</CardTitle>
          <CardDescription>Basic information about your organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            {message && (
              <div className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">{message}</div>
            )}
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
