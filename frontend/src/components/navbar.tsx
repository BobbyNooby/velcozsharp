"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const API = "http://localhost:5038/api";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/assets", label: "Assets" },
  { href: "/vulnerabilities", label: "CVEs" },
  { href: "/cve-mapping", label: "Dashboard" },
  { href: "/auth-test", label: "Auth Test" },
  { href: "/nvd-test", label: "NVD Test" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [currentOrgId, setCurrentOrgId] = useState<string>("");
  const [orgs, setOrgs] = useState<{ id: string; name: string; isDefault: boolean }[]>([]);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.organizations?.length > 0) {
          const mapped = data.organizations.map((o: any) => ({
            id: o.organizationId,
            name: o.organizationName,
            isDefault: o.isDefault,
          }));
          setOrgs(mapped);
          const defaultOrg = mapped.find((o: any) => o.isDefault);
          if (defaultOrg && !currentOrgId) setCurrentOrgId(defaultOrg.id);
        }
      }
    } catch {}
  }, [currentOrgId]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Store selected org in a cookie-like way via a global event or localStorage
  // For simplicity, we use localStorage and dispatch an event
  useEffect(() => {
    if (currentOrgId) {
      localStorage.setItem("currentOrgId", currentOrgId);
      window.dispatchEvent(new Event("org-change"));
    }
  }, [currentOrgId]);

  return (
    <nav className="border-b bg-background sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-lg tracking-tight">
            VelcozSharp
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {orgs.length > 0 && (
            <Select value={currentOrgId} onValueChange={(v) => v && setCurrentOrgId(v)}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Select org" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </nav>
  );
}
