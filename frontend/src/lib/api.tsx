"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

const API_BASE = "http://localhost:5038/api";

export type Org = {
  id: string;
  name: string;
  role: string;
  isDefault: boolean;
};

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
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data) {
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
        }
      })
      .catch(() => {})
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
