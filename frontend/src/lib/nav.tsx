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
import { SETTINGS_ROUTE_ROLES } from "./route-roles";

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
 * Re-exported from route-roles.ts to keep the single source of truth.
 */
export { SETTINGS_ROUTE_ROLES };