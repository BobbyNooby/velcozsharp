"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

function PublicAuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, authReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authReady && isAuthenticated) {
      router.replace("/");
    }
  }, [authReady, isAuthenticated, router]);

  if (!authReady || isAuthenticated) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicAuthGuard>
      <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 p-4">
        <div className="mb-8 flex items-center gap-2 text-2xl font-bold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            V
          </span>
          VelcozSharp
        </div>
        <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Self-hosted asset & vulnerability management.
        </p>
      </div>
    </PublicAuthGuard>
  );
}
