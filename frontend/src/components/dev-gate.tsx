"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DevGate({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">Not available</h1>
        <p className="text-muted-foreground">This page is only available in development mode.</p>
        <Link href="/" className={cn(buttonVariants({ variant: "default" }))}>
          Go home
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
