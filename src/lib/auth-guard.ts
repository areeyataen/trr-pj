/**
 * Auth Guard helpers for API routes (Next.js App Router)
 * ใช้ตรวจสอบ NextAuth session ก่อนให้เข้าถึง API ที่ต้องการสิทธิ์ admin
 */
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// NextAuth options (import inline เพื่อหลีกเลี่ยง circular import)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@cane.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin1234";
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "cane-web-secret-2026";

import CredentialsProvider from "next-auth/providers/credentials";
import NextAuth from "next-auth";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Admin Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (
          credentials?.email === ADMIN_EMAIL &&
          credentials?.password === ADMIN_PASSWORD
        ) {
          return { id: "admin", name: "Admin", email: ADMIN_EMAIL, role: "admin" } as any;
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) token.role = (user as any).role;
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) (session.user as any).role = token.role;
      return session;
    },
  },
  pages: { signIn: "/login" },
  secret: NEXTAUTH_SECRET,
};

/** คืน true ถ้า request มี admin session, false ถ้าไม่มี */
export async function isAdminSession(): Promise<boolean> {
  try {
    const session = await getServerSession(authOptions);
    return (session?.user as any)?.role === "admin";
  } catch {
    return false;
  }
}

/** ใช้ใน API route handler — ถ้าไม่ใช่ admin ให้ return 401 ทันที */
export async function requireAdmin(): Promise<NextResponse | null> {
  const ok = await isAdminSession();
  if (!ok) {
    return NextResponse.json(
      { message: "Unauthorized: กรุณาล็อกอินในฐานะเจ้าหน้าที่ก่อน" },
      { status: 401 }
    );
  }
  return null; // null = ผ่าน
}
