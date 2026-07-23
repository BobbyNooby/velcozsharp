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

/**
 * Stable API fetcher that reads orgId from context.
 * Returns a stable function reference (memoized) so it can safely be used in useEffect deps.
 * Supports AbortSignal for cancellation.
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
      return res;
    },
    [orgId]
  );
}

/**
 * Fetch /auth/me once, populate org context, and return user data.
 * Uses authReady state (not a ref) so React Strict Mode remounts work correctly.
 */
export function useAuthSession() {
  const { orgId, orgs, authReady, setOrgId, setOrgs, setAuthReady } = useOrg();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authReady) return; // already initialized

    let cancelled = false;

    fetch(`${API_BASE}/auth/me`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          console.warn(`[Auth] /auth/me returned ${res.status} ${res.statusText}`);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data) {
          console.log("[Auth] Session loaded:", data.email, data.role);
          setUser(data);
          if (data.organizations?.length > 0) {
            const mapped = data.organizations.map((o: any) => ({
              id: o.organizationId,
              name: o.organizationName,
              role: o.role,
              isDefault: o.isDefault,
            }));
            setOrgs(mapped);
            if (!orgId) {
              const def = mapped.find((o: Org) => o.isDefault);
              if (def) setOrgId(def.id);
            }
          }
        } else {
          console.log("[Auth] No active session");
        }
      })
      .catch((err) => {
        console.error("[Auth] /auth/me fetch failed:", err);
        if (err instanceof TypeError) {
          console.error(
            `[Auth] Cannot reach backend at ${API_BASE}. Possible causes:\n` +
            `1. Backend is not running on ${API_BASE}\n` +
            `2. CORS blocked the request\n` +
            `3. Page loaded over HTTPS but backend is HTTP (mixed content)\n` +
            `Set NEXT_PUBLIC_API_URL env var if backend runs elsewhere.`
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setAuthReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, orgId, setOrgId, setOrgs, setAuthReady]);

  return { user, loading, orgId, orgs, authReady, setOrgId };
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
