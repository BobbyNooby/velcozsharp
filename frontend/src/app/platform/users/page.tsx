"use client";

import { useEffect, useState, useRef, useTransition } from "react";
import { useApiFetch, useDebounce } from "@/lib/api";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Users, Lock, Unlock, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type PlatformUser = {
  id: string;
  email: string;
  displayName?: string;
  createdAt: string;
  isLockedOut: boolean;
  organizations: Array<{ organizationId: string; organizationName: string; role: string }>;
};

export default function PlatformUsersPage() {
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [message, setMessage] = useState("");
  const [actionPending, startAction] = useTransition();
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchUsers = async (signal?: AbortSignal) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());

    try {
      const res = await apiFetch(`/platform/users?${params.toString()}`, { signal });
      if (!res.ok || !mountedRef.current) return;
      const data = await res.json();
      setUsers(data.items || []);
      setTotalCount(data.totalCount || 0);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchUsers(controller.signal);
    return () => controller.abort();
  }, [apiFetch, page, pageSize, debouncedSearch]);

  const runAction = async (action: () => Promise<Response>, successMessage: string) => {
    setMessage("");
    startAction(async () => {
      try {
        const res = await action();
        if (res.ok && mountedRef.current) {
          setMessage(successMessage);
          fetchUsers();
        } else if (mountedRef.current) {
          const data = await res.json().catch(() => ({}));
          setMessage(data.message || "Action failed.");
        }
      } catch {
        if (mountedRef.current) setMessage("Network error.");
      }
    });
  };

  const lockUser = (id: string) => runAction(() => apiFetch(`/platform/users/${id}/lock`, { method: "POST" }), "User locked.");
  const unlockUser = (id: string) => runAction(() => apiFetch(`/platform/users/${id}/unlock`, { method: "POST" }), "User unlocked.");
  const resetPassword = (id: string) => runAction(() => apiFetch(`/platform/users/${id}/reset-password`, { method: "POST" }), "Password reset. Check the response for the new password.");
  const setPassword = (id: string) => {
    if (!newPassword || newPassword.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }
    runAction(
      () => apiFetch(`/platform/users/${id}/set-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      }),
      "Password updated."
    );
    setNewPassword("");
    setSelectedUser(null);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <PageHeader
        title={<><Users className="size-6" /> Users</>}
        description="Manage all users on the platform."
      />

      {message && (
        <Alert className={message.includes("failed") || message.includes("error") ? "border-destructive" : ""}>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-sm"
          />
        </CardContent>
      </Card>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Orgs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6}>
                  <TableSkeleton rows={5} columns={6} />
                </TableCell>
              </TableRow>
            )}
            {!loading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No users found
                </TableCell>
              </TableRow>
            )}
            {!loading && users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.email}</TableCell>
                <TableCell>{user.displayName || "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.organizations.map((o) => (
                      <Badge key={o.organizationId} variant="outline" className="text-xs">
                        {o.organizationName} · {o.role}
                      </Badge>
                    ))}
                    {user.organizations.length === 0 && <span className="text-muted-foreground text-sm">None</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={user.isLockedOut ? "destructive" : "default"}>
                    {user.isLockedOut ? "Locked" : "Active"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {user.isLockedOut ? (
                      <Button size="sm" variant="outline" onClick={() => unlockUser(user.id)} disabled={actionPending}>
                        <Unlock className="mr-1 size-3" /> Unlock
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => lockUser(user.id)} disabled={actionPending}>
                        <Lock className="mr-1 size-3" /> Lock
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => resetPassword(user.id)} disabled={actionPending}>
                      <KeyRound className="mr-1 size-3" /> Reset
                    </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="secondary" disabled={actionPending}>
                          Set password
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Set password</DialogTitle>
                          <DialogDescription>
                            Set a new password for {user.email}. This action is immediate.
                          </DialogDescription>
                        </DialogHeader>
                        <Input
                          type="password"
                          placeholder="New password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                        <DialogFooter>
                          <Button onClick={() => setPassword(user.id)} disabled={actionPending || newPassword.length < 6}>
                            {actionPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                            Update password
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {users.length} of {totalCount} users
        </div>
        <div className="flex items-center gap-2">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-[100px] h-8">
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
