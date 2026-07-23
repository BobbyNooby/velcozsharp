"use client";

import { useEffect, useRef, useState } from "react";
import { useOrg, useApiFetch } from "@/lib/api";
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

type Member = {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  isDefault: boolean;
};

const ROLES = ["Admin", "SecurityAnalyst", "Viewer"];

export default function MembersPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Viewer");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchMembers = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await apiFetch("/users");
      if (res.ok && mountedRef.current) {
        setMembers(await res.json());
      }
    } catch {}
    finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [orgId, apiFetch]);

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      const res = await apiFetch("/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteEmail("");
        setMessage(data.message ?? "User invited");
        fetchMembers();
      } else {
        setMessage(data.message ?? "Invite failed");
      }
    } catch {
      setMessage("Network error");
    }
  };

  const updateRole = async (userId: string, role: string) => {
    try {
      const res = await apiFetch(`/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setMessage("Role updated");
        fetchMembers();
      } else {
        const data = await res.json();
        setMessage(data.message ?? "Update failed");
      }
    } catch {
      setMessage("Network error");
    }
  };

  const remove = async (userId: string) => {
    if (!confirm("Remove this user from the organization?")) return;
    try {
      const res = await apiFetch(`/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        setMessage("User removed");
        fetchMembers();
      } else {
        const data = await res.json();
        setMessage(data.message ?? "Remove failed");
      }
    } catch {
      setMessage("Network error");
    }
  };

  if (!authReady) return <div className="max-w-7xl mx-auto p-6">Loading...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organization Members</h1>
        <p className="text-sm text-muted-foreground">Invite and manage members</p>
      </div>

      {message && (
        <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm">{message}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invite Member</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3">
            <Input
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1"
            />
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v ?? "Viewer")}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="SecurityAnalyst">Security Analyst</SelectItem>
                <SelectItem value="Viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={invite}>Invite</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Loading...</div>
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
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="text-red-600" onClick={() => remove(m.userId)}>
                        Remove
                      </Button>
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
