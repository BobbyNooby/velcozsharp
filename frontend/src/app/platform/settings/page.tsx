"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export default function PlatformSettingsPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <PageHeader
        title={<><Settings className="size-6" /> Instance Settings</>}
        description="Global platform configuration."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming soon</CardTitle>
          <CardDescription>
            Global settings such as instance name, user registration policy, and retention will be configured here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            For now, platform-wide user and organization management is available from the sidebar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
