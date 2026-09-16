import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerToken } from "@/lib/customer-auth";
import { sendTemplate } from "@/lib/email";

export const runtime = "nodejs";

// POST /api/store/account/delete-request { token } -- customer-initiated
// request to remove their account, reviewed by hand from the CRM's
// /account-deletion page (same manual-approval pattern as Membership /
// Verification / Heroes Discount). Idempotent: an existing request's
// status is returned instead of creating a duplicate.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const claims = verifyCustomerToken(typeof body?.token === "string" ? body.token : null);
  if (!claims) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const existing = await prisma.accountDeletionRequest.findUnique({ where: { contactId: claims.contactId } });
  if (existing) {
    return NextResponse.json({ status: existing.status });
  }

  await prisma.accountDeletionRequest.create({
    data: { organizationId: claims.organizationId, contactId: claims.contactId },
  });

  const contact = await prisma.contact.findUnique({ where: { id: claims.contactId } });
  if (contact) {
    await sendTemplate(claims.organizationId, "account_deletion_received", contact.email, {
      customerName: contact.name || contact.email,
    }).catch((err) => console.error("Account deletion request confirmation email failed", err));
  }

  return NextResponse.json({ status: "PENDING" });
}
