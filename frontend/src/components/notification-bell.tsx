"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOrg, useApiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Notification = {
  id: string;
  type: number;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
};

export default function NotificationBell() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const router = useRouter();
  const mountedRef = useRef(true);

  const [count, setCount] = useState(0);
  const [recent, setRecent] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchData = async () => {
    if (!orgId) return;
    try {
      const [countRes, listRes] = await Promise.all([
        apiFetch("/notifications/unread-count"),
        apiFetch("/notifications?pageSize=5"),
      ]);
      if (countRes.ok && mountedRef.current) {
        const c = await countRes.json();
        setCount(c.count);
      }
      if (listRes.ok && mountedRef.current) {
        const data = await listRes.json();
        setRecent(data.items ?? []);
      }
    } catch {}
  };

  useEffect(() => {
    if (!authReady) return;
    fetchData();
    const interval = setInterval(fetchData, 30000); // fallback polling every 30s

    const handleRealtime = () => fetchData();
    window.addEventListener("velcoz:notification", handleRealtime);

    return () => {
      clearInterval(interval);
      window.removeEventListener("velcoz:notification", handleRealtime);
    };
  }, [orgId, apiFetch, authReady]);

  const markRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
      fetchData();
    } catch {}
  };

  const markAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiFetch("/notifications/mark-all-read", { method: "POST" });
      fetchData();
    } catch {}
  };

  const onClickNotification = (n: Notification) => {
    if (!n.isRead) {
      apiFetch(`/notifications/${n.id}/read`, { method: "PATCH" }).then(() => fetchData());
    }
    setOpen(false);
    if (n.link) {
      router.push(n.link);
    } else {
      router.push("/notifications");
    }
  };

  if (!authReady) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className="relative inline-flex items-center justify-center h-9 w-9 rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <BellIcon className="h-5 w-5" />
        {count > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center px-1 text-xs bg-red-500 text-white border-0">
            {count > 99 ? "99+" : count}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-medium">Notifications</span>
          {count > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-blue-600 hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {recent.length === 0 ? (
          <div className="px-2 py-4 text-sm text-gray-500 text-center">
            No notifications yet.
          </div>
        ) : (
          recent.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="flex flex-col items-start gap-0.5 cursor-pointer"
              onClick={() => onClickNotification(n)}
            >
              <div className="flex items-center gap-2 w-full">
                <span className={`text-sm font-medium ${n.isRead ? "text-gray-600" : "text-foreground"}`}>
                  {n.title}
                </span>
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-500" />}
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{n.message}</p>
              <div className="flex items-center justify-between w-full mt-1">
                <span className="text-[10px] text-gray-400">
                  {new Date(n.createdAt).toLocaleTimeString()}
                </span>
                {!n.isRead && (
                  <button
                    onClick={(e) => markRead(e, n.id)}
                    className="text-[10px] text-blue-600 hover:underline"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <Link href="/notifications" onClick={() => setOpen(false)}>
          <DropdownMenuItem className="cursor-pointer justify-center text-sm text-blue-600">
            View all notifications
          </DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
