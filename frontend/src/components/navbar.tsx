"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOrg, useAuthSession } from "@/lib/api";
import NotificationBell from "@/components/notification-bell";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/assets", label: "Assets" },
  { href: "/vulnerabilities", label: "CVEs" },
  { href: "/cve-mapping", label: "Scan" },
  { href: "/settings/scan-schedules", label: "Schedules" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/departments", label: "Departments" },
  { href: "/settings/asset-types", label: "Asset Types" },
  { href: "/settings/audit-logs", label: "Audit Logs" },
  { href: "/health", label: "Health" },
  { href: "/dev-tools", label: "Dev Tools" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { orgId, orgs, setOrgId } = useOrg();

  // Initialize auth session / org context once on mount
  useAuthSession();

  return (
    <nav className="border-b bg-background sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-lg tracking-tight">
            VelcozSharp
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <NotificationBell />
          {orgs.length > 0 && (
            <Select value={orgId || " "} onValueChange={(v) => v && v !== " " && setOrgId(v)}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Select org" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </nav>
  );
}
