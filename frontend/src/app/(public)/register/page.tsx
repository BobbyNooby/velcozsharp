"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, UserPlus } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [isPending, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [createOrg, setCreateOrg] = useState(true);
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    const orgName = createOrg ? (organizationName.trim() || `${displayName || email}'s Organization`) : undefined;

    startTransition(async () => {
      const result = await register({
        email,
        password,
        displayName: displayName.trim() || undefined,
        organizationName: orgName,
      });
      if (result.ok) {
        router.replace("/");
      } else {
        setError(result.error || "Registration failed");
      }
    });
  };

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
          <UserPlus className="size-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Create account</CardTitle>
        <CardDescription>Get started with VelcozSharp</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
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
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              placeholder="Jane Doe"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">Must be at least 6 characters.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isPending}
            />
          </div>

          <div className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              id="createOrg"
              checked={createOrg}
              onCheckedChange={(checked) => setCreateOrg(checked === true)}
              disabled={isPending}
            />
            <div className="space-y-2 leading-none">
              <Label htmlFor="createOrg" className="font-medium">
                Create an organization
              </Label>
              <p className="text-xs text-muted-foreground">
                You will become the admin of this organization.
              </p>
              {createOrg && (
                <Input
                  placeholder="Organization name"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  disabled={isPending}
                  className="mt-2"
                />
              )}
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isPending || !email.trim() || !password || !confirmPassword}
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Create account
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
