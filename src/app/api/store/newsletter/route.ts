import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { sendTemplate } from "@/lib/email";

export const runtime = "nodejs";

// POST /api/store/newsletter -- called by evlv-site's server-only proxy
// (same x-store-domain/x-store-api-key auth as /api/store/checkout).
// Marks Contact.marketingOptIn = true (the same flag the in-house
// Newsletter sender at /email-marketing/newsletter reads from -- that's
// the source of truth, this DB write always happens first and
// unconditionally) then sends a one-off confirmation via Resend.
//
// No Mailchimp here -- this app doesn't use it. Bulk/campaign sends are
// the in-house Newsletter sender above; a real marketing-campaign tool
// (Omnisend) is a separate, not-yet-built feature, not this route.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const contact = await prisma.contact.upsert({
    where: { organizationId_email: { organizationId: store.organizationId, email } },
    update: { marketingOptIn: true },
    create: { organizationId: store.organizationId, email, marketingOptIn: true },
  });
  await prisma.contactBrandLink.upsert({
    where: { contactId_brandId: { contactId: contact.id, brandId: store.brandId } },
    update: {},
    create: { contactId: contact.id, brandId: store.brandId },
  });

  await sendTemplate(store.organizationId, "newsletter_subscribed", email, {
    customerName: contact.name || email,
  }).catch((err) => console.error("Newsletter confirmation email failed", err));

  return NextResponse.json({ ok: true });
}
