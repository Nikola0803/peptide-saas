import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/auth/2fa/recovery-codes
// Returns whether recovery codes exist and how many are unused.
// Does NOT return the plaintext codes (those were shown exactly once at setup).
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [total, used] = await Promise.all([
    prisma.totpRecoveryCode.count({ where: { userId } }),
    prisma.totpRecoveryCode.count({ where: { userId, usedAt: { not: null } } }),
  ]);

  return NextResponse.json({ total, used, remaining: total - used });
}
