"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import * as signalR from "@microsoft/signalr";
import { useToast } from "@/lib/toast";
import { useOrg } from "@/lib/api";
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
  const { addToast } = useToast();
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  useEffect(() => {
    if (!authReady) return;

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
      }
    });

    conn.start()
      .then(() => setConnected(true))
      .catch(() => setConnected(false));

    conn.onreconnecting(() => setConnected(false));
    conn.onreconnected(() => setConnected(true));
    conn.onclose(() => setConnected(false));

    return () => {
      conn.stop();
      connectionRef.current = null;
    };
  }, [authReady, addToast, router]);

  // Join/leave org group when org changes
  useEffect(() => {
    const conn = connectionRef.current;
    if (!conn || !connected || !orgId) return;

    conn.invoke("JoinOrganization", orgId).catch(() => {});

    return () => {
      conn.invoke("LeaveOrganization", orgId).catch(() => {});
    };
  }, [orgId, connected]);

  return (
    <SignalRContext.Provider value={{ connection: connectionRef.current, connected }}>
      {children}
    </SignalRContext.Provider>
  );
}

export function useSignalR() {
  return useContext(SignalRContext);
}
