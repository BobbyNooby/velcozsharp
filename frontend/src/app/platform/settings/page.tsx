"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function PlatformSettingsPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="size-6" />
          Instance Settings
        </h1>
        <p className="text-sm text-muted-foreground">Global platform configuration.</p>
      </div>

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
