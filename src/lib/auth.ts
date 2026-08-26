import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Credentials + JWT sessions, kept deliberately simple for the skeleton.
// Once multiple organizations per user / invitations exist, the "active
// org" the person is viewing should move into the JWT via a session
// callback like the stub below.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: { memberships: { include: { organization: true } } },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        const primaryMembership = user.memberships[0];

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
          organizationId: primaryMembership?.organizationId ?? null,
          organizationName: primaryMembership?.organization.name ?? null,
          role: primaryMembership?.role ?? null,
          // Only meaningful when role is DROPSHIP_AGENT -- see Supplier in
          // schema.prisma and requireSupplier() in session.ts, which
          // re-verifies this against the DB rather than trusting the JWT
          // alone for anything access-control-sensitive.
          supplierId: primaryMembership?.supplierId ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.organizationId = (user as any).organizationId;
        token.organizationName = (user as any).organizationName;
        token.role = (user as any).role;
        token.supplierId = (user as any).supplierId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).organizationId = token.organizationId;
        (session.user as any).organizationName = token.organizationName;
        (session.user as any).role = token.role;
        (session.user as any).supplierId = token.supplierId;
      }
      return session;
    },
  },
};
