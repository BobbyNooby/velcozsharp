"use client";

import { useState, useEffect } from "react";

const API = "http://localhost:5038/api";

export function useCurrentOrgId() {
  const [orgId, setOrgId] = useState<string>("");

  useEffect(() => {
    const stored = localStorage.getItem("currentOrgId");
    if (stored) setOrgId(stored);

    const handleChange = () => {
      const updated = localStorage.getItem("currentOrgId");
      if (updated) setOrgId(updated);
    };

    window.addEventListener("org-change", handleChange);
    return () => window.removeEventListener("org-change", handleChange);
  }, []);

  return orgId;
}

export function useApiFetch(orgId: string) {
  return async (path: string, options?: RequestInit) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string>),
    };
    if (orgId) headers["X-Organization-Id"] = orgId;
    const res = await fetch(`${API}${path}`, { ...options, headers, credentials: "include" });
    return res;
  };
}
