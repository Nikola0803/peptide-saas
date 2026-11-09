import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { verifyTotp } from "@/lib/totp";

// POST /api/auth/2fa/disable  { password: "...", totp: "..." }
// Requires the user's password AND their current TOTP code to disable 2FA.
// This is a destructive operation: an attacker who only has a session cookie
// cannot disable 2FA without also knowing the password and having the device.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const totp = typeof body.totp === "string" ? body.totp.trim() : "";

  if (!password || !totp) {
    return NextResponse.json({ error: "Password and 2FA code required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 400 });
  }

  if (!user.totpEnabled || !user.totpSecret) {
    return NextResponse.json({ error: "2FA is not enabled" }, { status: 400 });
  }

  if (!verifyTotp(user.totpSecret, totp)) {
    return NextResponse.json({ error: "Invalid 2FA code" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.totpRecoveryCode.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null, totpVerifiedAt: null },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
