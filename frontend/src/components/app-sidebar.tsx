"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/api";
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
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserMenu } from "@/components/user-menu";
import { settingsNavItems, filterNavByRole } from "@/lib/nav";
import { ChevronDown, Plus, Check, Shield, Home, Server, ShieldAlert, ScanLine, FlaskConical, Building2, Users, Settings } from "lucide-react";

const mainNav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/assets", label: "Assets", icon: Server },
  { href: "/vulnerabilities", label: "CVEs", icon: ShieldAlert },
  { href: "/cve-mapping", label: "Scan", icon: ScanLine, roles: ["Admin", "SecurityAnalyst"] },
  { href: "/scan-lab", label: "Scan Lab", icon: FlaskConical, roles: ["Admin", "SecurityAnalyst"] },
];

const platformAdminNav = [
  { href: "/platform", label: "Dashboard", icon: Home },
  { href: "/platform/organizations", label: "Organizations", icon: Building2 },
  { href: "/platform/users", label: "Users", icon: Users },
  { href: "/platform/settings", label: "Settings", icon: Settings },
];

function useCurrentOrgRole() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  return user?.organizations.find((o) => o.id === orgId)?.role || "";
}

function orgInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function NavItem({
  href,
  label,
  icon: Icon,
  isActive,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  isActive: boolean;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link href={href} className="flex items-center gap-2">
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuth();
  const { orgId, orgs, setOrgId } = useOrg();
  const currentOrg = orgs.find((o) => o.id === orgId);
  const orgRole = useCurrentOrgRole();

  const filteredMainNav = mainNav.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(orgRole);
  });

  const filteredSettingsNav = filterNavByRole(settingsNavItems, orgRole);

  if (!isAuthenticated) return null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  className="h-auto min-h-[2.75rem] py-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary text-sm font-semibold">
                    {currentOrg ? orgInitial(currentOrg.name) : <Shield className="size-4" />}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold">{currentOrg?.name ?? "No organization"}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {orgRole ? `${orgRole} · VelcozSharp` : "VelcozSharp"}
                    </span>
                  </div>
                  <ChevronDown className="size-4 shrink-0 opacity-50 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56"
                align="start"
                side="bottom"
              >
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Organizations</div>
                {orgs.map((org) => (
                  <DropdownMenuItem key={org.id} onClick={() => setOrgId(org.id)} className="cursor-pointer gap-2">
                    <div className="flex aspect-square size-6 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium">
                      {orgInitial(org.name)}
                    </div>
                    <div className="flex flex-1 flex-col overflow-hidden">
                      <span className="truncate">{org.name}</span>
                      <span className="text-xs text-muted-foreground">{org.role}</span>
                    </div>
                    {org.id === orgId && <Check className="size-4 shrink-0 text-primary" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/settings/organizations" className="flex items-center gap-2">
                    <Plus className="size-4" />
                    Manage organizations
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarMenu>
            {filteredMainNav.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarMenu>
            {filteredSettingsNav.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={pathname === item.href || pathname.startsWith(item.href)}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {user?.isPlatformAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Platform Admin</SidebarGroupLabel>
            <SidebarMenu>
              {platformAdminNav.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  isActive={pathname === item.href || (item.href !== "/platform" && pathname.startsWith(item.href))}
                />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
