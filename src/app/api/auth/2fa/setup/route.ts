import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateTotpSecret, encryptSecret } from "@/lib/totp";
import QRCode from "qrcode";

// GET /api/auth/2fa/setup
// Generates a fresh TOTP secret for the current user and returns a QR code
// data URI. Does NOT enable 2FA yet — that happens only after the user
// confirms with a valid code via /api/auth/2fa/enable.
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Allow re-generating the secret even if 2FA is already enabled
  // (user wants to re-enroll with a new device).
  const { secret, otpauth } = generateTotpSecret(user.email);
  const encrypted = encryptSecret(secret);

  // Store the pending secret (not yet enabled)
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: encrypted },
  });

  const qrDataUri = await QRCode.toDataURL(otpauth);

  return NextResponse.json({ qrDataUri, otpauth });
}
