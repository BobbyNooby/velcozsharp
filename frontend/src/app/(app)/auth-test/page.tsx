import { cookies } from "next/headers";
import AuthTestClient from "./AuthTestClient";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5038/api";

async function fetchWithAuth(path: string, cookieHeader: string, orgId?: string) {
  try {
    const headers: Record<string, string> = { Cookie: cookieHeader };
    if (orgId) headers["X-Organization-Id"] = orgId;

    const res = await fetch(`${API}${path}`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function AuthTestPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  // Always try to fetch session first
  const user = await fetchWithAuth("/auth/me", cookieHeader);

  // Determine default org from user's memberships
  const defaultOrg = user?.organizations?.find((o: any) => o.isDefault);
  const defaultOrgId = defaultOrg?.organizationId;

  // Only fetch tenant data if user is authenticated and has a default org
  const [depts, assetTypes] = user && defaultOrgId
    ? await Promise.all([
        fetchWithAuth("/departments", cookieHeader, defaultOrgId),
        fetchWithAuth("/asset-types", cookieHeader, defaultOrgId),
      ])
    : [null, null];

  return (
    <AuthTestClient
      initialUser={user}
      initialDepts={depts ?? []}
      initialAssetTypes={assetTypes ?? []}
      initialOrgId={defaultOrgId ?? ""}
    />
  );
}
