import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyTotp, generateRecoveryCodes, hashRecoveryCode } from "@/lib/totp";

// POST /api/auth/2fa/enable  { code: "123456" }
// Verifies the user's TOTP code against the pending secret, then atomically:
//  1. Marks totpEnabled = true
//  2. Generates and stores 8 hashed recovery codes
//  3. Returns the plaintext recovery codes (shown to user exactly once)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "Code required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.totpSecret) {
    return NextResponse.json({ error: "No pending 2FA setup. Call /api/auth/2fa/setup first." }, { status: 400 });
  }

  if (!verifyTotp(user.totpSecret, code)) {
    return NextResponse.json({ error: "Invalid code. Make sure your device clock is accurate." }, { status: 400 });
  }

  // Generate recovery codes
  const plainCodes = generateRecoveryCodes();
  const hashedCodes = await Promise.all(plainCodes.map(hashRecoveryCode));

  await prisma.$transaction([
    // Remove any old recovery codes
    prisma.totpRecoveryCode.deleteMany({ where: { userId } }),
    // Insert new ones
    ...hashedCodes.map((codeHash) =>
      prisma.totpRecoveryCode.create({ data: { userId, codeHash } })
    ),
    // Enable 2FA
    prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true, totpVerifiedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ recoveryCodes: plainCodes });
}
