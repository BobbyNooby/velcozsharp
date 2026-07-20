"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Settings,
  Brain,
  Users,
  Building2,
  CalendarClock,
  Shield,
  Layers,
  FileText,
} from "lucide-react";

const settingsNav = [
  { href: "/settings/general", label: "General", icon: Settings },
  { href: "/settings/ai", label: "AI", icon: Brain },
  { href: "/settings/scan-schedules", label: "Scan Schedules", icon: CalendarClock },
  { href: "/settings/members", label: "Members", icon: Users },
  { href: "/settings/departments", label: "Departments", icon: Building2 },
  { href: "/settings/asset-types", label: "Asset Types", icon: Layers },
  { href: "/settings/audit-logs", label: "Audit Logs", icon: FileText },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <aside className="w-full md:w-64 shrink-0">
          <div className="border rounded-lg p-2 space-y-1">
            <div className="px-3 py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Organization Settings
            </div>
            {settingsNav.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
