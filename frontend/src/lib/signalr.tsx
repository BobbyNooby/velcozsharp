"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import * as signalR from "@microsoft/signalr";
import { useToast } from "@/lib/toast";
import { useOrg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

type NotificationMessage = {
  id: string;
  type: number;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
};

type SignalRContextValue = {
  connection: signalR.HubConnection | null;
  connected: boolean;
};

const SignalRContext = createContext<SignalRContextValue>({ connection: null, connected: false });

export function SignalRProvider({ children }: { children: ReactNode }) {
  const { orgId, authReady } = useOrg();
  const { isAuthenticated } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // The hub requires the auth cookie, so only connect for authenticated
    // users — connecting from public pages (e.g. /login) just spams
    // "negotiation failed: 401" console errors. `isAuthenticated` flips true
    // right after login (AuthConsumer.refreshUser), which re-runs this effect
    // and establishes the connection — no page refresh needed. Logout tears
    // the connection down via the cleanup below.
    if (!authReady || !isAuthenticated) return;

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${(process.env.NEXT_PUBLIC_API_URL || "http://localhost:5038/api").replace("/api", "")}/hubs/notifications`, {
        withCredentials: true,
        transport: signalR.HttpTransportType.WebSockets |
                   signalR.HttpTransportType.ServerSentEvents |
                   signalR.HttpTransportType.LongPolling,
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connectionRef.current = conn;

    conn.on("NewNotification", (notification: NotificationMessage) => {
      addToast({
        title: notification.title,
        message: notification.message,
        variant: notification.type === 0 ? "destructive" : "default",
        duration: 6000,
        onClick: () => {
          if (notification.link) {
            router.push(notification.link);
          }
        },
      });

      // Trigger a custom event so the bell/page can refresh without polling
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("velcoz:notification", { detail: notification }));
      }
    });

    conn.on("ScanProgress", (progress: any) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("velcoz:scan-progress", { detail: progress }));
        // A terminal progress update means the job record changed; notify listeners
        // so pollers can refresh immediately.
        if (progress?.status === "Completed" || progress?.status === "Failed") {
          window.dispatchEvent(new CustomEvent("velcoz:job-changed", { detail: progress }));
        }
      }
    });

    conn.start()
      .then(() => {
        if (mountedRef.current) setConnected(true);
      })
      .catch(() => {
        if (mountedRef.current) setConnected(false);
      });

    conn.onreconnecting(() => {
      if (mountedRef.current) setConnected(false);
    });
    conn.onreconnected(() => {
      if (mountedRef.current) setConnected(true);
    });
    conn.onclose(() => {
      if (mountedRef.current) setConnected(false);
    });

    return () => {
      conn.stop();
      connectionRef.current = null;
    };
  }, [authReady, isAuthenticated, addToast, router]);

  // Join/leave org group when org changes
  useEffect(() => {
    const conn = connectionRef.current;
    if (!conn || !connected || !orgId) return;

    conn.invoke("JoinOrganization", orgId).catch(() => {});

    return () => {
      conn.invoke("LeaveOrganization", orgId).catch(() => {});
    };
  }, [orgId, connected]);

  const value = useMemo(
    () => ({ connection: connectionRef.current, connected }),
    [connected]
  );

  return (
    <SignalRContext.Provider value={value}>
      {children}
    </SignalRContext.Provider>
  );
}

export function useSignalR() {
  return useContext(SignalRContext);
}
