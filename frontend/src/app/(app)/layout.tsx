"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/api";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardSkeleton } from "@/components/skeletons";
import NotificationBell from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, authReady, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", window.location.origin);
      loginUrl.searchParams.set("returnTo", pathname);
      router.replace(loginUrl.toString());
      return;
    }

    const hasOrgs = (user?.organizations.length ?? 0) > 0;
    if (!hasOrgs && pathname !== "/onboarding") {
      router.replace("/onboarding");
      return;
    }
    if (hasOrgs && pathname === "/onboarding") {
      router.replace("/");
    }
  }, [authReady, isAuthenticated, router, pathname, user]);

  if (!authReady || isLoading) {
    return (
      <div className="flex h-svh items-center justify-center">
        <DashboardSkeleton />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}

function OrgContextChip() {
  const { orgs, orgId } = useOrg();
  const currentOrg = orgs.find((o) => o.id === orgId);
  if (!currentOrg) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm md:hidden">
      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/12 text-[10px] font-semibold text-primary">
        {currentOrg.name.trim().charAt(0).toUpperCase()}
      </span>
      <span className="truncate font-medium">{currentOrg.name}</span>
      <span className="truncate text-xs text-muted-foreground">{currentOrg.role}</span>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SidebarProvider defaultOpen>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger />
            <Separator orientation="vertical" className="hidden h-6 sm:block" />
            <OrgContextChip />
            <div className="flex flex-1 items-center justify-end gap-4">
              <ThemeToggle />
              <NotificationBell />
            </div>
          </header>
          <div className="flex flex-1 flex-col overflow-auto">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  );
}
