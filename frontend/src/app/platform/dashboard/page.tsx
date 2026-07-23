"use client";

import { useEffect, useState, useRef } from "react";
import { useApiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";
import { Database, Building2, Users, Server, ShieldAlert, Activity } from "lucide-react";

type PlatformStats = {
  organizationCount: number;
  userCount: number;
  totalAssetCount: number;
  totalVulnerabilityCount: number;
  activeScanJobCount: number;
  databaseHealthy: boolean;
};

export default function PlatformDashboardPage() {
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    apiFetch("/platform/stats")
      .then(async (res) => {
        if (!res.ok || !mountedRef.current) return;
        setStats(await res.json());
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => { mountedRef.current = false; };
  }, [apiFetch]);

  const cards = stats
    ? [
        { label: "Organizations", value: stats.organizationCount, icon: Building2 },
        { label: "Users", value: stats.userCount, icon: Users },
        { label: "Assets", value: stats.totalAssetCount, icon: Server },
        { label: "CVEs", value: stats.totalVulnerabilityCount, icon: ShieldAlert },
        { label: "Active Jobs", value: stats.activeScanJobCount, icon: Activity },
        {
          label: "Database",
          value: stats.databaseHealthy ? "Healthy" : "Unhealthy",
          icon: Database,
          variant: stats.databaseHealthy ? "default" : "destructive",
        },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <PageHeader
        title="Platform Dashboard"
        description="Instance-wide overview."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {loading || !stats
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          : cards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <card.icon className="size-3.5" />
                    {card.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {card.variant ? (
                    <Badge variant={card.variant as any}>{card.value}</Badge>
                  ) : (
                    <div className="text-3xl font-bold">{card.value}</div>
                  )}
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  );
}
