"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useOrg, useApiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Plus, Star } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export default function OrganizationsSettingsPage() {
  const { user, refreshUser } = useAuth();
  const { orgs, orgId, setOrgId } = useOrg();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgDescription, setNewOrgDescription] = useState("");
  const [createMessage, setCreateMessage] = useState("");
  const [createPending, startCreateTransition] = useTransition();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const createOrganization = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateMessage("");
    startCreateTransition(async () => {
      try {
        const res = await apiFetch("/organizations", {
          method: "POST",
          body: JSON.stringify({
            name: newOrgName.trim(),
            description: newOrgDescription.trim() || null,
            nvdApiKey: null,
            isAiEnabled: false,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && mountedRef.current) {
          setCreateMessage("Organization created.");
          setNewOrgName("");
          setNewOrgDescription("");
          await refreshUser();
        } else if (mountedRef.current) {
          setCreateMessage(data.message || "Failed to create organization.");
        }
      } catch {
        if (mountedRef.current) setCreateMessage("Network error.");
      }
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6">
      <PageHeader
        title="Organizations"
        description="Switch between organizations or create a new one."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your organizations</CardTitle>
          <CardDescription>Click an organization to switch to it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {orgs.length === 0 && (
            <div className="text-sm text-muted-foreground">You are not a member of any organization yet.</div>
          )}
          {orgs.map((org) => (
            <div
              key={org.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{org.name}</span>
                  {org.id === orgId && (
                    <Badge variant="secondary" className="text-xs">
                      <Check className="mr-1 size-3" /> Active
                    </Badge>
                  )}
                  {org.isDefault && (
                    <Badge variant="outline" className="text-xs">
                      <Star className="mr-1 size-3" /> Default
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{org.role}</span>
              </div>
              {org.id !== orgId && (
                <Button size="sm" variant="outline" onClick={() => setOrgId(org.id)}>
                  Switch
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="size-4" />
            Create organization
          </CardTitle>
          <CardDescription>Create a new organization and become its admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createOrganization} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization name</Label>
              <Input
                id="orgName"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Acme Corp"
                disabled={createPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgDescription">Description</Label>
              <Input
                id="orgDescription"
                value={newOrgDescription}
                onChange={(e) => setNewOrgDescription(e.target.value)}
                placeholder="Optional"
                disabled={createPending}
              />
            </div>
            {createMessage && (
              <Alert className={createMessage.includes("Failed") || createMessage.includes("error") ? "border-destructive" : ""}>
                <AlertDescription>{createMessage}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={createPending || !newOrgName.trim()}>
              {createPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create organization
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
