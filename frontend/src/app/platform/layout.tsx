"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Home, Building2, Users, Settings, ArrowLeft, Shield } from "lucide-react";

const platformAdminNav = [
  { href: "/platform", label: "Dashboard", icon: Home },
  { href: "/platform/organizations", label: "Organizations", icon: Building2 },
  { href: "/platform/users", label: "Users", icon: Users },
  { href: "/platform/settings", label: "Settings", icon: Settings },
];

function PlatformAdminGuard({ children }: { children: React.ReactNode }) {
  const { user, authReady, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated || !user?.isPlatformAdmin) {
      const loginUrl = new URL("/login", window.location.origin);
      loginUrl.searchParams.set("returnTo", pathname);
      router.replace(loginUrl.toString());
    }
  }, [authReady, isAuthenticated, user?.isPlatformAdmin, router, pathname, user]);

  if (!authReady || !isAuthenticated || !user?.isPlatformAdmin) {
    return (
      <div className="flex h-svh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}

function PlatformSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              href="/"
              className="flex h-9 items-center gap-2 overflow-hidden rounded-md px-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <ArrowLeft className="size-4 shrink-0" />
              <span className="truncate">Back to app</span>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Instance</SidebarGroupLabel>
          <SidebarMenu>
            {platformAdminNav.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href || (item.href !== "/platform" && pathname.startsWith(item.href))}
                >
                  <Link href={item.href} className="flex items-center gap-2">
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlatformAdminGuard>
      <SidebarProvider defaultOpen>
        <PlatformSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-primary" />
              <span className="font-semibold">Platform Admin</span>
            </div>
            <div className="flex flex-1 items-center justify-end gap-4">
              <ThemeToggle />
            </div>
          </header>
          <div className="flex flex-1 flex-col overflow-auto">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </PlatformAdminGuard>
  );
}
