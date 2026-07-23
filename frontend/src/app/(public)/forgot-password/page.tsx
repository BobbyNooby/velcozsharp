"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, ArrowLeft } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5038/api";

export default function ForgotPasswordPage() {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    startTransition(async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok || res.status === 501) {
          // 501 is the current expected response because email is not configured.
          // The UI treats it as a success because the request has been recorded for admins.
          setStatus({
            type: "success",
            message:
              data.message ||
              "Your request has been sent to your organization's administrators. They can reset your password.",
          });
        } else {
          setStatus({ type: "error", message: data.message || "Request failed. Please try again." });
        }
      } catch {
        setStatus({ type: "error", message: "Network error. Is the backend running?" });
      }
    });
  };

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="size-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Forgot password?</CardTitle>
        <CardDescription>We&apos;ll notify your administrators to reset it.</CardDescription>
      </CardHeader>
      <CardContent>
        {status?.type === "success" ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>{status.message}</AlertDescription>
            </Alert>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline" }), "w-full flex items-center gap-2")}
            >
              <ArrowLeft className="size-4" />
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {status?.type === "error" && (
              <Alert variant="destructive">
                <AlertDescription>{status.message}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending || !email.trim()}>
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Request reset
            </Button>
            <div className="text-center">
              <Link href="/login" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <ArrowLeft className="size-3" />
                Back to login
              </Link>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
