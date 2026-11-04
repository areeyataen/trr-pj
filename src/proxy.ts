/**
 * Next.js Middleware — Route protection
 *
 * Protected routes (admin only):
 *   /admin/*      – farmer management
 *   /weigh-slip   – issue weigh tickets
 *   /points       – real-time points dashboard
 *
 * Public routes (no login needed):
 *   /             – home
 *   /register     – LINE farmer registration
 *   /claim        – QR scan claim page
 *   /login        – login page
 *   /api/*        – API routes (secured by logic inside each route)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const SECRET = process.env.NEXTAUTH_SECRET ?? "cane-web-secret-2026";

// Routes that require authentication (admin role)
const PROTECTED_PREFIXES = ["/admin", "/weigh-slip", "/points"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if this path is protected
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(prefix + "/")
  );

  if (!isProtected) return NextResponse.next();

  // Try to read the JWT token from the session cookie
  const token = await getToken({ req: request, secret: SECRET });

  if (!token) {
    // Not logged in → redirect to /login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Check role
  if ((token as any).role !== "admin") {
    // Logged in but not admin → forbidden page
    return NextResponse.redirect(new URL("/forbidden", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/weigh-slip",
    "/weigh-slip/:path*",
    "/points",
    "/points/:path*",
  ],
};
