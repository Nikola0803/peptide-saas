import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyCustomerToken } from "@/lib/customer-auth";
import { sendTemplate } from "@/lib/email";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string(),
  institution: z.string().trim().min(1),
  role: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
});

// POST /api/store/verification/request { token, institution, role, phone,
// purpose } -- see RESEARCHER-VERIFICATION.md. Idempotent: an existing
// CustomerVerification row's status is returned instead of creating a
// duplicate.
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const claims = verifyCustomerToken(parsed.data.token);
  if (!claims) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const existing = await prisma.customerVerification.findUnique({ where: { contactId: claims.contactId } });
  if (existing) {
    return NextResponse.json({ status: existing.status });
  }

  const { institution, role, phone, purpose } = parsed.data;
  await prisma.customerVerification.create({
    data: { organizationId: claims.organizationId, contactId: claims.contactId, institution, role, phone, purpose },
  });

  const contact = await prisma.contact.findUnique({ where: { id: claims.contactId } });
  if (contact) {
    await sendTemplate(claims.organizationId, "verification_received", contact.email, {
      customerName: contact.name || contact.email,
    }).catch((err) => console.error("Verification request confirmation email failed", err));
  }

  return NextResponse.json({ status: "PENDING" });
}
