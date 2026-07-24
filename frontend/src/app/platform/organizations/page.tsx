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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Building2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type PlatformOrg = {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  userCount: number;
  assetCount: number;
};

export default function PlatformOrganizationsPage() {
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);
  const [orgs, setOrgs] = useState<PlatformOrg[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [isActiveFilter, setIsActiveFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [message, setMessage] = useState("");
  const [actionPending, startAction] = useTransition();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchOrgs = async (signal?: AbortSignal) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (isActiveFilter && isActiveFilter !== " ") params.set("isActive", isActiveFilter);

    try {
      const res = await apiFetch(`/platform/organizations?${params.toString()}`, { signal });
      if (!res.ok || !mountedRef.current) return;
      const data = await res.json();
      setOrgs(data.items || []);
      setTotalCount(data.totalCount || 0);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchOrgs(controller.signal);
    return () => controller.abort();
  }, [apiFetch, page, pageSize, debouncedSearch, isActiveFilter]);

  const updateStatus = (id: string, isActive: boolean) => {
    setMessage("");
    startAction(async () => {
      try {
        const res = await apiFetch(`/platform/organizations/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive }),
        });
        if (res.ok && mountedRef.current) {
          setMessage(`Organization ${isActive ? "enabled" : "disabled"}.`);
          fetchOrgs();
        } else if (mountedRef.current) {
          const data = await res.json().catch(() => ({}));
          setMessage(data.message || "Update failed.");
        }
      } catch {
        if (mountedRef.current) setMessage("Network error.");
      }
    });
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <PageHeader
        title={<><Building2 className="size-6" /> Organizations</>}
        description="Manage all organizations on the platform."
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
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-sm"
          />
          <Select value={isActiveFilter} onValueChange={(v) => { setIsActiveFilter(v ?? ""); setPage(1); }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=" ">All</SelectItem>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Assets</TableHead>
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
            {!loading && orgs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No organizations found
                </TableCell>
              </TableRow>
            )}
            {!loading && orgs.map((org) => (
              <TableRow key={org.id}>
                <TableCell>
                  <div className="font-medium">{org.name}</div>
                  {org.description && <div className="text-xs text-muted-foreground">{org.description}</div>}
                </TableCell>
                <TableCell>
                  <Badge variant={org.isActive ? "default" : "secondary"}>{org.isActive ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell>{org.userCount}</TableCell>
                <TableCell>{org.assetCount}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(org.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant={org.isActive ? "outline" : "default"}
                    onClick={() => updateStatus(org.id, !org.isActive)}
                    disabled={actionPending}
                  >
                    {actionPending && <Loader2 className="mr-2 size-3 animate-spin" />}
                    {org.isActive ? "Disable" : "Enable"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {orgs.length} of {totalCount} organizations
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
