"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrg, useApiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Notification = {
  id: string;
  type: number;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
};

export default function NotificationsPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const router = useRouter();
  const mountedRef = useRef(true);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchNotifications = async (p = page) => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/notifications?page=${p}&pageSize=${pageSize}`);
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setNotifications(data.items ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {} finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (authReady) fetchNotifications();
    const handleRealtime = () => fetchNotifications();
    window.addEventListener("velcoz:notification", handleRealtime);
    return () => window.removeEventListener("velcoz:notification", handleRealtime);
  }, [orgId, apiFetch, authReady, page]);

  const markRead = async (id: string) => {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
      fetchNotifications();
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await apiFetch("/notifications/mark-all-read", { method: "POST" });
      fetchNotifications();
    } catch {}
  };

  const onClick = (n: Notification) => {
    if (!n.isRead) markRead(n.id);
    if (n.link) router.push(n.link);
  };

  if (!authReady) return <div className="max-w-7xl mx-auto p-6">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-sm text-gray-600">Stay on top of critical CVEs and scan activity</p>
        </div>
        <Button variant="outline" onClick={markAllRead}>Mark all read</Button>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            No notifications yet. Run a scan or use the test button in Dev Tools.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={`cursor-pointer transition-colors ${n.isRead ? "bg-gray-50" : "bg-white"}`}
              onClick={() => onClick(n)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${n.isRead ? "text-gray-600" : "text-foreground"}`}>
                        {n.title}
                      </span>
                      {!n.isRead && <Badge className="bg-blue-100 text-blue-700">Unread</Badge>}
                    </div>
                    <p className="text-sm text-gray-600">{n.message}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {!n.isRead && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                      >
                        Mark read
                      </Button>
                    )}
                    {n.link && (
                      <span className="text-xs text-blue-600">Click to view</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {total > pageSize && (
            <div className="flex justify-between items-center pt-4">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {page} of {Math.ceil(total / pageSize)}
              </span>
              <Button
                variant="outline"
                disabled={page >= Math.ceil(total / pageSize)}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
