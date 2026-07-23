import {
  Settings,
  Brain,
  Users,
  Building2,
  CalendarClock,
  Layers,
  FileText,
  UserCircle,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  /** Org-role names allowed. Undefined = all roles. */
  roles?: string[];
};

/** Settings sub-nav — single source of truth used by the app sidebar and the settings sub-nav. */
export const settingsNavItems: NavItem[] = [
  { href: "/settings/general", label: "General", icon: Settings },
  { href: "/settings/ai", label: "AI", icon: Brain, roles: ["Admin"] },
  { href: "/settings/scan-schedules", label: "Scan Schedules", icon: CalendarClock, roles: ["Admin", "SecurityAnalyst"] },
  { href: "/settings/members", label: "Members", icon: Users, roles: ["Admin"] },
  { href: "/settings/departments", label: "Departments", icon: Building2, roles: ["Admin", "SecurityAnalyst"] },
  { href: "/settings/asset-types", label: "Asset Types", icon: Layers, roles: ["Admin", "SecurityAnalyst"] },
  { href: "/settings/audit-logs", label: "Audit Logs", icon: FileText },
  { href: "/settings/account", label: "Account", icon: UserCircle },
  { href: "/settings/organizations", label: "Organizations", icon: Building2 },
];

export function filterNavByRole(items: NavItem[], role: string): NavItem[] {
  return items.filter((item) => !item.roles || item.roles.includes(role));
}

/**
 * Settings routes that require an elevated org-role.
 * Middleware reads the velcoz_org cookie and blocks mismatches server-side.
 * Excludes the auth-cookie-only check (which is platform admin, handled separately).
 */
export const SETTINGS_ROUTE_ROLES: Record<string, string[]> = {
  "/settings/ai": ["Admin"],
  "/settings/members": ["Admin"],
  "/settings/scan-schedules": ["Admin", "SecurityAnalyst"],
  "/settings/departments": ["Admin", "SecurityAnalyst"],
  "/settings/asset-types": ["Admin", "SecurityAnalyst"],
};