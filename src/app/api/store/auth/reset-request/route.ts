import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { signResetToken } from "@/lib/customer-auth";
import { sendEmail } from "@/lib/email";

const bodySchema = z.object({ email: z.string().email() });

// POST /api/store/auth/reset-request { email }
// Always returns 200 even if the email isn't found (avoids user enumeration).
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();

  const contact = await prisma.contact.findUnique({
    where: { organizationId_email: { organizationId: store.organizationId, email } },
    select: { id: true, name: true, passwordHash: true },
  });

  if (contact?.passwordHash) {
    const token = signResetToken(email);
    const resetUrl = `https://${store.brandDomain}/account/reset?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    const name = contact.name || email;
    const isZoonetics = store.brandDomain.toLowerCase().includes("zoonetics");
    const btnBg = isZoonetics ? "#17233B" : "#2B1810";
    let delivered = false;
    try {
      delivered = await sendEmail(
        email,
        "Reset your password",
        `<p>Hi ${name},</p>
<p>Click the link below to reset your password. This link expires in 1 hour.</p>
<p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:${btnBg};color:#FFFFFF;text-decoration:none;border-radius:8px;font-weight:600;">Reset Password</a></p>
<p>If you didn't request this, ignore this email - your password won't change.</p>
<p style="color:#888;font-size:12px;">Research Use Only</p>`
      );
    } catch {
      delivered = false;
    }
    if (!delivered) {
      // Resend not configured or delivery failed — log the URL so it can be
      // found in PM2 logs for testing: pm2 logs --lines 50
      console.warn(`[reset-request] Email not delivered to ${email}. Reset URL: ${resetUrl}`);
    }
  }

  // Always return success to avoid user enumeration
  return NextResponse.json({ ok: true });
}
