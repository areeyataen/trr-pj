/**
 * NextAuth v4 route handler — /api/auth/[...nextauth]
 */
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

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
