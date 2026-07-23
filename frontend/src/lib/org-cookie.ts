export const ORG_COOKIE = "velcoz_org";

export type Org = {
  id: string;
  name: string;
  role: string;
  isDefault: boolean;
};

export type OrgCookieValue = { orgId: string; role: string };

export function parseOrgCookie(raw: string | undefined | null): OrgCookieValue | null {
  if (!raw) return null;
  const idx = raw.indexOf(":");
  if (idx < 0) return null;
  const orgId = raw.slice(0, idx);
  const role = raw.slice(idx + 1);
  if (!orgId || !role) return null;
  return { orgId, role };
}

export function setOrgCookie(orgId: string, role: string) {
  const value = `${orgId}:${role}`;
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${ORG_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function clearOrgCookie() {
  document.cookie = `${ORG_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}