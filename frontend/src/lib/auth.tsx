"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { OrgProvider, useOrg, type Org } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5038/api";

export type AuthUser = {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  isPlatformAdmin: boolean;
  organizations: Org[];
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authReady: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (data: RegisterRequest) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

export type RegisterRequest = {
  email: string;
  password: string;
  displayName?: string;
  organizationName?: string;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  authReady: false,
  login: async () => ({ ok: false }),
  register: async () => ({ ok: false }),
  logout: async () => {},
  refreshUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function AuthConsumer({ children }: { children: ReactNode }) {
  const { orgId, setOrgId, setOrgs, setAuthReady } = useOrg();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authReady, setAuthReadyState] = useState(false);
  const mountedRef = useRef(true);

  const mapMemberships = useCallback((data: any): Org[] => {
    return (data.organizations || []).map((o: any) => ({
      id: o.organizationId,
      name: o.organizationName,
      role: o.role,
      isDefault: o.isDefault,
    }));
  }, []);

  const applySession = useCallback(
    (data: any) => {
      if (!data) {
        setUser(null);
        setOrgs([]);
        setOrgId("");
        return;
      }

      const mappedUser: AuthUser = {
        userId: data.userId,
        email: data.email,
        displayName: data.displayName,
        role: data.role,
        isPlatformAdmin: !!data.isPlatformAdmin,
        organizations: mapMemberships(data),
      };

      setUser(mappedUser);
      setOrgs(mappedUser.organizations);

      if (!orgId && mappedUser.organizations.length > 0) {
        const def = mappedUser.organizations.find((o) => o.isDefault);
        setOrgId(def?.id || mappedUser.organizations[0].id);
      }
    },
    [mapMemberships, orgId, setOrgId, setOrgs]
  );

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await fetchMe();
    if (mountedRef.current) {
      applySession(data);
    }
  }, [applySession, fetchMe]);

  useEffect(() => {
    mountedRef.current = true;

    fetchMe()
      .then((data) => {
        if (mountedRef.current) {
          applySession(data);
          setAuthReadyState(true);
          setAuthReady(true);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setAuthReadyState(true);
          setAuthReady(true);
          setIsLoading(false);
        }
      });

    return () => {
      mountedRef.current = false;
    };
  }, [applySession, fetchMe, setAuthReady]);

  const login = useCallback(
    async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { ok: false, error: data.message || "Invalid email or password" };
        }

        await refreshUser();
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error. Is the backend running?" };
      }
    },
    [refreshUser]
  );

  const register = useCallback(
    async (data: RegisterRequest): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: data.email,
            password: data.password,
            displayName: data.displayName,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: err.message || "Registration failed" };
        }

        // If user provided an org name, create it after registration.
        if (data.organizationName?.trim()) {
          const orgRes = await fetch(`${API_BASE}/organizations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              name: data.organizationName.trim(),
              description: "",
              nvdApiKey: null,
              isAiEnabled: false,
            }),
          });
          if (!orgRes.ok) {
            console.warn("Registration succeeded but organization creation failed");
          }
        }

        await refreshUser();
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error. Is the backend running?" };
      }
    },
    [refreshUser]
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    }
    if (mountedRef.current) {
      setUser(null);
      setOrgs([]);
      setOrgId("");
    }
  }, [setOrgId, setOrgs]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        authReady,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <AuthConsumer>{children}</AuthConsumer>
    </OrgProvider>
  );
}
