"use client";

import { useEffect, useRef, useState } from "react";
import { useOrg, useApiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/skeletons";

type Member = {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  isDefault: boolean;
};

const ROLES = ["Admin", "SecurityAnalyst", "Viewer"];

// Display-friendly names; the raw API values stay in the SelectItem `value`s.
const ROLE_LABELS: Record<string, string> = {
  Admin: "Admin",
  SecurityAnalyst: "Security Analyst",
  Viewer: "Viewer",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRM_DISARM_MS = 3000;

async function getApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.message || fallback;
  } catch {
    return fallback;
  }
}

export default function MembersPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const { addToast } = useToast();
  const mountedRef = useRef(true);

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Viewer");
  const [inviteError, setInviteError] = useState("");
  const [inviting, setInviting] = useState(false);

  // Two-step remove confirm
  const [removeArmId, setRemoveArmId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, []);

  const fetchMembers = async (signal?: AbortSignal) => {
    if (!orgId) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/users", { signal });
      if (res.ok && mountedRef.current) {
        setMembers(await res.json());
      } else if (!res.ok && mountedRef.current) {
        setError("Failed to load members.");
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (mountedRef.current) setError("Failed to load members.");
    }
    finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchMembers(controller.signal);
    return () => controller.abort();
  }, [orgId, apiFetch]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) {
      setInviteError("Email is required");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setInviteError("Enter a valid email address");
      return;
    }
    setInviteError("");
    setInviting(true);
    try {
      const res = await apiFetch("/users/invite", {
        method: "POST",
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        addToast({ title: data.message ?? "User invited", variant: "success" });
        setInviteEmail("");
        if (mountedRef.current) fetchMembers();
      } else if (mountedRef.current) {
        addToast({ title: data.message ?? "Invite failed", variant: "destructive" });
      }
    } catch {
      if (mountedRef.current) addToast({ title: "Network error", variant: "destructive" });
    } finally {
      if (mountedRef.current) setInviting(false);
    }
  };

  const updateRole = async (userId: string, role: string) => {
    try {
      const res = await apiFetch(`/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        addToast({ title: "Role updated", variant: "success" });
        if (mountedRef.current) fetchMembers();
      } else {
        addToast({
          title: await getApiError(res, "Update failed"),
          variant: "destructive",
        });
      }
    } catch {
      addToast({ title: "Network error", variant: "destructive" });
    }
  };

  const disarmRemove = () => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = null;
    setRemoveArmId(null);
  };

  const handleRemoveClick = (userId: string) => {
    if (removeArmId === userId) {
      remove(userId);
      return;
    }
    disarmRemove();
    setRemoveArmId(userId);
    armTimerRef.current = setTimeout(disarmRemove, CONFIRM_DISARM_MS);
  };

  const remove = async (userId: string) => {
    disarmRemove();
    setRemovingId(userId);
    try {
      const res = await apiFetch(`/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        addToast({ title: "User removed", variant: "success" });
        if (mountedRef.current) fetchMembers();
      } else {
        addToast({
          title: await getApiError(res, "Remove failed"),
          variant: "destructive",
        });
      }
    } catch {
      addToast({ title: "Network error", variant: "destructive" });
    } finally {
      if (mountedRef.current) setRemovingId(null);
    }
  };

  if (!authReady) return <div className="max-w-7xl mx-auto p-6">Loading...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <PageHeader
        title="Organization Members"
        description="Invite and manage members"
      />

      <Card>
        <CardHeader>
          <CardTitle>Invite Member</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={invite} noValidate className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label htmlFor="invite-email" className="text-sm font-medium">Email</label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteError(""); }}
                disabled={inviting}
              />
              {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
            </div>
            <div className="space-y-1">
              <label htmlFor="invite-role" className="text-sm font-medium">Role</label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v ?? "Viewer")}>
                <SelectTrigger id="invite-role" className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={inviting} className="self-end">
              {inviting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Invite
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={4} columns={4} />
          ) : error ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => fetchMembers()}>Retry</Button>
            </div>
          ) : members.length === 0 ? (
            <div className="text-muted-foreground">No members found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell>{m.email}</TableCell>
                    <TableCell>{m.displayName}</TableCell>
                    <TableCell>
                      <Select value={m.role} onValueChange={(v) => updateRole(m.userId, v ?? m.role)}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      {removeArmId === m.userId ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemoveClick(m.userId)}
                          disabled={removingId === m.userId}
                        >
                          {removingId === m.userId && <Loader2 className="mr-1 size-3 animate-spin" />}
                          Confirm?
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleRemoveClick(m.userId)}>
                          Remove
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
    </div>
  );
}
