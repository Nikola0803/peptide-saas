import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyTotp, verifyRecoveryCode } from "@/lib/totp";

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

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
        totp: { label: "2FA Code", type: "text" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase();
        const ip =
          (req?.headers?.["x-forwarded-for"] as string | undefined)
            ?.split(",")[0]
            ?.trim() ??
          (req?.headers?.["x-real-ip"] as string | undefined) ??
          null;

        // Rate-limit: block after MAX_FAILED_ATTEMPTS within the window
        const recentFails = await prisma.loginAttempt.count({
          where: {
            email,
            success: false,
            createdAt: { gte: new Date(Date.now() - LOGIN_WINDOW_MS) },
          },
        });

        if (recentFails >= MAX_FAILED_ATTEMPTS) {
          throw new Error("TOO_MANY_ATTEMPTS");
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { memberships: { include: { organization: true } } },
        });

        if (!user) {
          // Log the attempt even for unknown emails (prevents enumeration via
          // different response times, and keeps the rate-limit table consistent)
          await prisma.loginAttempt.create({
            data: { email, ip, success: false },
          });
          return null;
        }

        const validPassword = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!validPassword) {
          await prisma.loginAttempt.create({
            data: { email, userId: user.id, ip, success: false },
          });
          return null;
        }

        // --- 2FA check (only if enabled) ---
        if (user.totpEnabled && user.totpSecret) {
          const totpInput = (credentials.totp ?? "").trim();

          if (!totpInput) {
            // Password was correct — tell the client a 2FA code is needed.
            // This does NOT create a session; signIn() will return error="2FA_REQUIRED".
            throw new Error("2FA_REQUIRED");
          }

          // Try TOTP first, then recovery codes
          const totpValid = verifyTotp(user.totpSecret, totpInput);

          if (!totpValid) {
            // Check recovery codes (single-use, stored as bcrypt hashes)
            const unused = await prisma.totpRecoveryCode.findMany({
              where: { userId: user.id, usedAt: null },
            });

            let matchedId: string | null = null;
            for (const rc of unused) {
              if (await verifyRecoveryCode(totpInput, rc.codeHash)) {
                matchedId = rc.id;
                break;
              }
            }

            if (!matchedId) {
              await prisma.loginAttempt.create({
                data: { email, userId: user.id, ip, success: false },
              });
              throw new Error("INVALID_2FA");
            }

            // Burn the recovery code
            await prisma.totpRecoveryCode.update({
              where: { id: matchedId },
              data: { usedAt: new Date() },
            });
          }
        }

        // All checks passed
        await prisma.loginAttempt.create({
          data: { email, userId: user.id, ip, success: true },
        });

        const primaryMembership = user.memberships[0];

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
          organizationId: primaryMembership?.organizationId ?? null,
          organizationName: primaryMembership?.organization.name ?? null,
          role: primaryMembership?.role ?? null,
          supplierId: primaryMembership?.supplierId ?? null,
          totpEnabled: user.totpEnabled,
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
        token.totpEnabled = (user as any).totpEnabled;
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
        (session.user as any).totpEnabled = token.totpEnabled;
      }
      return session;
    },
  },
};
