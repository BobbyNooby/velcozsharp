"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useOrg, useApiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Loader2, UserCircle, KeyRound, Check } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export default function AccountSettingsPage() {
  const { user, refreshUser } = useAuth();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [profileMessage, setProfileMessage] = useState("");
  const [profilePending, startProfileTransition] = useTransition();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordPending, startPasswordTransition] = useTransition();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName);
  }, [user?.displayName]);

  const updateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage("");
    startProfileTransition(async () => {
      try {
        const res = await apiFetch("/auth/me", {
          method: "PATCH",
          body: JSON.stringify({ displayName: displayName.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && mountedRef.current) {
          setProfileMessage("Profile updated.");
          await refreshUser();
        } else if (mountedRef.current) {
          setProfileMessage(data.message || "Update failed.");
        }
      } catch {
        if (mountedRef.current) setProfileMessage("Network error.");
      }
    });
  };

  const changePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage("");

    if (newPassword !== confirmPassword) {
      setPasswordMessage("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage("Password must be at least 6 characters.");
      return;
    }

    startPasswordTransition(async () => {
      try {
        const res = await apiFetch("/auth/change-password", {
          method: "POST",
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && mountedRef.current) {
          setPasswordMessage("Password changed successfully.");
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        } else if (mountedRef.current) {
          setPasswordMessage(data.message || "Password change failed.");
        }
      } catch {
        if (mountedRef.current) setPasswordMessage("Network error.");
      }
    });
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <PageHeader
        title={<><UserCircle className="size-6" /> Account</>}
        description="Manage your profile and security."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Update your display name.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={updateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={user?.email || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={profilePending}
              />
            </div>
            {profileMessage && (
              <Alert className={profileMessage.includes("failed") || profileMessage.includes("error") ? "border-destructive" : ""}>
                <AlertDescription>{profileMessage}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={profilePending || !displayName.trim()}>
              {profilePending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Update profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="size-4" />
            Change password
          </CardTitle>
          <CardDescription>Update your password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={passwordPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={passwordPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={passwordPending}
                required
              />
            </div>
            {passwordMessage && (
              <Alert className={passwordMessage.includes("failed") || passwordMessage.includes("error") ? "border-destructive" : ""}>
                <AlertDescription>{passwordMessage}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              disabled={passwordPending || !currentPassword || !newPassword || !confirmPassword}
            >
              {passwordPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
