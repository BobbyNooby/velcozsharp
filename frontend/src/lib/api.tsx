"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { setOrgCookie, clearOrgCookie, type Org } from "@/lib/org-cookie";

export type { Org };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5038/api";

type OrgContextValue = {
  orgId: string;
  orgs: Org[];
  authReady: boolean;
  setOrgId: (id: string) => void;
  setOrgs: (orgs: Org[]) => void;
  setAuthReady: (ready: boolean) => void;
};

const OrgContext = createContext<OrgContextValue>({
  orgId: "",
  orgs: [],
  authReady: false,
  setOrgId: () => {},
  setOrgs: () => {},
  setAuthReady: () => {},
});

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [orgId, setOrgId] = useState<string>("");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [authReady, setAuthReady] = useState(false);

  // Keep the velcoz_org cookie in sync with the active org + its role,
  // so middleware can guard settings routes server-side without a backend round-trip.
  useEffect(() => {
    if (orgId && authReady) {
      const current = orgs.find((o) => o.id === orgId);
      if (current) {
        setOrgCookie(orgId, current.role);
      } else {
        clearOrgCookie();
      }
    }
  }, [orgId, orgs, authReady]);

  return (
    <OrgContext.Provider value={{ orgId, orgs, authReady, setOrgId, setOrgs, setAuthReady }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?returnTo=${returnTo}`;
}

/**
 * Stable API fetcher that reads orgId from context.
 * Returns a stable function reference (memoized) so it can safely be used in useEffect deps.
 * Supports AbortSignal for cancellation.
 * Redirects to /login on 401 so every consumer does not have to handle session expiry.
 */
export function useApiFetch() {
  const { orgId } = useOrg();

  return useCallback(
    async (path: string, options?: RequestInit) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options?.headers as Record<string, string>),
      };
      if (orgId) headers["X-Organization-Id"] = orgId;
      const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
      if (res.status === 401) {
        redirectToLogin();
      }
      return res;
    },
    [orgId]
  );
}

/**
 * Debounce hook for search inputs.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
