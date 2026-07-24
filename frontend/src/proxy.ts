import { NextResponse, type NextRequest } from "next/server";
import { ROUTE_ROLES } from "./lib/route-roles";

const AUTH_COOKIE = "velcoz_auth";
const ORG_COOKIE = "velcoz_org";

const PUBLIC_PATHS = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/invite",
  "/api",
]);

const PUBLIC_PREFIXES = ["/_next", "/favicon.ico", "/static", "/images"];

function isPublic(path: string) {
  if (PUBLIC_PATHS.has(path)) return true;
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return true;
  return false;
}

function getOrgRole(cookieHeader: string): string | null {
  const parts = cookieHeader.split(";");
  for (const raw of parts) {
    const eq = raw.indexOf("=");
    const k = raw.slice(0, eq).trim();
    const v = raw.slice(eq + 1).trim();
    if (decodeURIComponent(k) === ORG_COOKIE) {
      const value = decodeURIComponent(v);
      const idx = value.indexOf(":");
      if (idx > 0) return value.slice(idx + 1);
    }
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasAuthCookie = request.cookies.has(AUTH_COOKIE);

  // Public routes: let through if unauthenticated; redirect authenticated away from login/register
  if (isPublic(pathname)) {
    if (hasAuthCookie && (pathname === "/login" || pathname === "/register")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Not authenticated: redirect to login
  if (!hasAuthCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Platform routes: verify the user is a platform admin by calling the backend.
  if (pathname.startsWith("/platform")) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5038/api"}/auth/me`, {
        headers: { Cookie: request.headers.get("cookie") || "" },
      });
      if (!res.ok) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("returnTo", pathname);
        return NextResponse.redirect(loginUrl);
      }
      const user = await res.json();
      if (!user.isPlatformAdmin) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    } catch (err) {
      console.error("[proxy] platform admin check failed", err);
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Routes that require an elevated org-role.
  const guarded = ROUTE_ROLES[pathname];
  if (guarded) {
    const role = getOrgRole(request.headers.get("cookie") || "");
    if (!role || !guarded.roles.includes(role)) {
      return NextResponse.redirect(new URL(guarded.redirectTo, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|json)$).*)",
  ],
};
