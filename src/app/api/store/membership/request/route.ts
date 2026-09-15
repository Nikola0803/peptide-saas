import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerToken } from "@/lib/customer-auth";
import { sendTemplate } from "@/lib/email";

export const runtime = "nodejs";

// POST /api/store/membership/request { token } -- resolves the Contact
// from the token. If a MembershipRequest already exists, returns its
// current status instead of creating a duplicate (same idempotency as the
// affiliate register endpoint). Otherwise creates one as PENDING, for
// manual review at /membership.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const claims = verifyCustomerToken(typeof body?.token === "string" ? body.token : null);
  if (!claims) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const existing = await prisma.membershipRequest.findUnique({ where: { contactId: claims.contactId } });
  if (existing) {
    return NextResponse.json({ status: existing.status });
  }

  await prisma.membershipRequest.create({
    data: { organizationId: claims.organizationId, contactId: claims.contactId },
  });

  const contact = await prisma.contact.findUnique({ where: { id: claims.contactId } });
  if (contact) {
    await sendTemplate(claims.organizationId, "membership_received", contact.email, {
      customerName: contact.name || contact.email,
    }).catch((err) => console.error("Membership request confirmation email failed", err));
  }

  return NextResponse.json({ status: "PENDING" });
}
