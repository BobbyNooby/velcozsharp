import { cookies } from "next/headers";
import AuthTestClient from "./AuthTestClient";

const API = "http://localhost:5038/api";

async function fetchWithAuth(path: string, cookieHeader: string) {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Cookie: cookieHeader },
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

  // Only fetch tenant data if user is authenticated
  const [orgs, depts, assetTypes] = user
    ? await Promise.all([
        fetchWithAuth("/organizations", cookieHeader),
        fetchWithAuth("/departments", cookieHeader),
        fetchWithAuth("/asset-types", cookieHeader),
      ])
    : [null, null, null];

  return (
    <AuthTestClient
      initialUser={user}
      initialOrgs={orgs ?? []}
      initialDepts={depts ?? []}
      initialAssetTypes={assetTypes ?? []}
    />
  );
}
