"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5038/api";

export default function HealthPage() {
  const [status, setStatus] = useState<"healthy" | "unhealthy" | "loading">("loading");
  const [checks, setChecks] = useState<Record<string, any>>({});
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchHealth = async (signal?: AbortSignal) => {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/health`, {
        credentials: "include",
        signal,
      });
      const data = await res.json();
      setChecks(data.checks ?? {});
      setStatus(data.status === "healthy" ? "healthy" : "unhealthy");
      setLastChecked(new Date());
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setStatus("unhealthy");
      setError("Failed to reach backend");
      setChecks({});
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal);
    intervalRef.current = setInterval(() => fetchHealth(controller.signal), 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      controller.abort();
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <PageHeader
        title="Backend Health"
        description="Polls the backend health endpoint every 5 seconds"
        actions={
          <Button onClick={() => fetchHealth()} variant="outline">
            Refresh
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Status:
            {status === "healthy" && <Badge className="bg-green-100 text-green-700">Healthy</Badge>}
            {status === "unhealthy" && <Badge className="bg-red-100 text-red-700">Unhealthy</Badge>}
            {status === "loading" && <Badge variant="secondary">Loading</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="text-red-600 text-sm">{error}</div>}
          {lastChecked && (
            <div className="text-sm text-muted-foreground">
              Last checked: {lastChecked.toLocaleTimeString()}
            </div>
          )}
          <div className="space-y-2">
            {Object.entries(checks).map(([key, value]) => (
              <div key={key} className="flex justify-between border-b py-2">
                <span className="font-medium capitalize">{key}</span>
                <span className="text-sm text-muted-foreground">{String(value)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
