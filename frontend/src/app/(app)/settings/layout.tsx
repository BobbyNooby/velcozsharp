"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/api";
import { settingsNavItems, filterNavByRole } from "@/lib/nav";
import { SETTINGS_ROUTE_ROLES } from "@/lib/route-roles";
import { RouteGuard } from "@/components/route-guard";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { orgId } = useOrg();
  const orgRole = user?.organizations.find((o) => o.id === orgId)?.role || "";

  const visibleNav = filterNavByRole(settingsNavItems, orgRole);

  // Guard any settings sub-route that requires an elevated org-role.
  const guardedRoute = Object.entries(SETTINGS_ROUTE_ROLES).find(
    ([route]) => pathname === route || pathname.startsWith(route + "/")
  );
  const content =
    guardedRoute && orgRole && !guardedRoute[1].includes(orgRole)
      ? <RouteGuard roles={guardedRoute[1]}>{children}</RouteGuard>
      : <>{children}</>;

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <div className="flex flex-col gap-6 md:flex-row">
        {/* Sidebar */}
        <aside className="w-full shrink-0 md:w-56">
          <div className="space-y-1 rounded-lg border p-2">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Settings
            </div>
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">{content}</main>
      </div>
    </div>
  );
}
