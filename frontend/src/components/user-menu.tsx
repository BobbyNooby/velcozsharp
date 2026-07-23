"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, LogOut, Settings, UserCircle, Building2, Shield } from "lucide-react";

export function UserMenu() {
  const { user, logout, isAuthenticated } = useAuth();
  const { orgs, orgId } = useOrg();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!isAuthenticated || !user) return null;

  const currentOrg = orgs.find((o) => o.id === orgId);
  const initials = (user.displayName || user.email).slice(0, 2).toUpperCase();

  const handleLogout = () => {
    startTransition(async () => {
      await logout();
      router.push("/login");
    });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="h-auto min-h-[2.5rem] items-center justify-start gap-2 py-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar className="size-7 shrink-0 rounded-md">
                <AvatarFallback className="rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col leading-none group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{user.displayName}</span>
                <span className="truncate text-xs text-sidebar-foreground/70">{currentOrg?.name || "No org"}</span>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56"
            align="start"
            side="right"
            sideOffset={8}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user.displayName}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {currentOrg?.role}
                    {user.isPlatformAdmin && " · Platform Admin"}
                  </p>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/settings/account" className="flex items-center gap-2">
                  <UserCircle className="size-4" />
                  Account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/settings/organizations" className="flex items-center gap-2">
                  <Building2 className="size-4" />
                  Organizations
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/settings" className="flex items-center gap-2">
                  <Settings className="size-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {user.isPlatformAdmin && (
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/platform" className="flex items-center gap-2">
                  <Shield className="size-4" />
                  Platform Admin
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={isPending}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LogOut className="mr-2 size-4" />}
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
