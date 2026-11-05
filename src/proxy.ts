/**
 * Next.js Middleware — Route protection
 *
 * Protected routes (admin role only):
 *   /admin/*         – farmer management, admin reports
 *   /weigh-slip      – issue weigh tickets & QR
 *   /points          – real-time points dashboard
 *   /api/admin/*     – admin API endpoints
 *
 * Public routes:
 *   /                – home
 *   /register        – LINE farmer registration
 *   /claim           – QR scan claim personal points
 *   /login           – login page
 *   /api/tickets     – GET is public (token check), POST requires admin inside handler
 *   /api/farmers     – GET with ?lineUserId is public, others require admin inside handler
 *   /api/claim       – public for farmers (validated by LIFF + DB ownership)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const SECRET = process.env.NEXTAUTH_SECRET ?? "cane-web-secret-2026";

const PROTECTED_PREFIXES = ["/admin", "/weigh-slip", "/points", "/api/admin"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );

  if (!isProtected) return NextResponse.next();

  // ตรวจสอบ JWT token จาก httpOnly cookie
  const token = await getToken({ req: request, secret: SECRET });

  if (!token || (token as any).role !== "admin") {
    // ถ้าเป็น API ให้ตอบ JSON 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { message: "Unauthorized: ต้องใช้สิทธิ์เจ้าหน้าที่ (Admin) เท่านั้น" },
        { status: 401 }
      );
    }

    // ถ้าเป็นหน้าเว็บทั่วไป ให้ redirect ไปที่ /login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
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
    "/api/admin/:path*",
  ],
};
