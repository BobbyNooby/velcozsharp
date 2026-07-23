"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/api";

export function RouteGuard({
  roles,
  children,
  fallback = "/settings",
}: {
  roles: string[];
  children: React.ReactNode;
  fallback?: string;
}) {
  const { user, authReady, isAuthenticated } = useAuth();
  const { orgId } = useOrg();
  const router = useRouter();

  const orgRole = user?.organizations.find((o) => o.id === orgId)?.role || "";
  const allowed = orgRole ? roles.includes(orgRole) : false;

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    if (!allowed) {
      router.replace(fallback);
    }
  }, [authReady, isAuthenticated, allowed, router, fallback]);

  if (!authReady || !isAuthenticated) {
    return (
      <div className="flex h-svh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex h-svh items-center justify-center p-6">
        <div className="text-center">
          <p className="text-lg font-semibold">Access denied</p>
          <p className="text-sm text-muted-foreground">You don&apos;t have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}