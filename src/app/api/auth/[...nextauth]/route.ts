/**
 * NextAuth v4 route handler — /api/auth/[...nextauth]
 * พร้อม Rate Limiting ป้องกันการ Brute Force รหัสผ่าน
 */
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { checkRateLimit } from "@/lib/rateLimit";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@cane.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin1234";

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Admin Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase() || "unknown";
        const rateKey = `login:attempt:${email}`;

        // Rate limit: 5 ครั้งต่อ 5 นาที
        const limitCheck = checkRateLimit(rateKey, 5, 5 * 60_000);
        if (!limitCheck.success) {
          throw new Error(
            `ลองเข้าสู่ระบบผิดเกินกำหนด กรุณารออีก ${limitCheck.resetInSeconds} วินาที`
          );
        }

        if (
          credentials?.email === ADMIN_EMAIL &&
          credentials?.password === ADMIN_PASSWORD
        ) {
          return {
            id: "admin",
            name: "Admin",
            email: ADMIN_EMAIL,
            role: "admin",
          } as any;
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = (user as any).role;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as any).role = token.role;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET ?? "cane-web-secret-2026",
});

export { handler as GET, handler as POST };

export const dynamic = "force-dynamic";
