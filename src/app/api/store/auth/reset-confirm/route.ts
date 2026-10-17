import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { verifyResetToken, hashPassword, signCustomerToken } from "@/lib/customer-auth";

const bodySchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

// POST /api/store/auth/reset-confirm { email, token, newPassword }
// Verifies the HMAC reset token and updates the password, then issues a
// session token so the customer is immediately logged in.
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
  const claims = verifyResetToken(parsed.data.token);
  if (!claims || claims.email !== email) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 422 });
  }

  const contact = await prisma.contact.findUnique({
    where: { organizationId_email: { organizationId: store.organizationId, email } },
  });
  if (!contact) {
    return NextResponse.json({ error: "No account found for this email." }, { status: 404 });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.contact.update({ where: { id: contact.id }, data: { passwordHash } });

  await prisma.contactBrandLink.upsert({
    where: { contactId_brandId: { contactId: contact.id, brandId: store.brandId } },
    update: {},
    create: { contactId: contact.id, brandId: store.brandId },
  });

  const token = signCustomerToken({
    contactId: contact.id,
    organizationId: store.organizationId,
    brandId: store.brandId,
    email,
  });

  return NextResponse.json({ token, email, username: contact.name || email, user_id: contact.id });
}
