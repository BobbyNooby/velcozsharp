/**
 * Single source of truth for route-level role gating.
 * Plain TypeScript — no React imports.
 */

export const ROUTE_ROLES: Record<string, { roles: string[]; redirectTo: string }> = {
  // Settings routes
  "/settings/ai": { roles: ["Admin"], redirectTo: "/settings" },
  "/settings/members": { roles: ["Admin"], redirectTo: "/settings" },
  "/settings/scan-schedules": { roles: ["Admin", "SecurityAnalyst"], redirectTo: "/settings" },
  "/settings/departments": { roles: ["Admin", "SecurityAnalyst"], redirectTo: "/settings" },
  "/settings/asset-types": { roles: ["Admin", "SecurityAnalyst"], redirectTo: "/settings" },

  // Workspace routes
  "/ai-chat": { roles: ["Admin", "SecurityAnalyst"], redirectTo: "/" },
  "/cve-mapping": { roles: ["Admin", "SecurityAnalyst"], redirectTo: "/" },
  "/scan-lab": { roles: ["Admin", "SecurityAnalyst"], redirectTo: "/" },
};

/**
 * Settings routes that require an elevated org-role.
 * Derived from ROUTE_ROLES to keep the existing settings/layout.tsx API working.
 */
export const SETTINGS_ROUTE_ROLES: Record<string, string[]> = Object.fromEntries(
  Object.entries(ROUTE_ROLES)
    .filter(([route]) => route.startsWith("/settings/"))
    .map(([route, { roles }]) => [route, roles])
);
