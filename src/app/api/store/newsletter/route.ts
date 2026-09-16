import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { sendTemplate, unsubscribeFooterHtml } from "@/lib/email";
import { pushContactToOmnisend } from "@/lib/omnisend";
import { signUnsubscribeToken } from "@/lib/customer-auth";
import { getStorefrontUrl } from "@/lib/storefront-url";

export const runtime = "nodejs";

const WELCOME_COUPON_PREFIX = "WELCOME10-";

// POST /api/store/newsletter -- called by evlv-site's server-only proxy
// (same x-store-domain/x-store-api-key auth as /api/store/checkout).
// Marks Contact.marketingOptIn = true (the same flag the in-house
// Newsletter sender at /email-marketing/newsletter reads from -- that's
// the source of truth, this DB write always happens first and
// unconditionally), issues a personal single-use 10%-off welcome coupon
// the first time this contact ever opts in (same assignedContact
// mechanism as Heroes Discount -- see coupon-engine.ts), pushes the
// contact to Omnisend (best-effort, no-op until OMNISEND_API_KEY is set --
// see src/lib/omnisend.ts), then sends a one-off confirmation via Resend
// with the code.
//
// Bulk/campaign sends are the in-house Newsletter sender at
// /email-marketing/newsletter -- this route only ever handles the single
// opt-in event.
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

  let couponCode = await prisma.coupon.findFirst({
    where: { organizationId: store.organizationId, assignedContactId: contact.id, code: { startsWith: WELCOME_COUPON_PREFIX } },
    select: { code: true },
  }).then((c) => c?.code);

  if (!couponCode) {
    const coupon = await prisma.coupon.create({
      data: {
        organizationId: store.organizationId,
        code: `${WELCOME_COUPON_PREFIX}${contact.id.slice(-8).toUpperCase()}`,
        description: `Newsletter welcome discount -- ${email}`,
        type: "PERCENT",
        percentOff: 10,
        allowStacking: false,
        maxRedemptions: 1,
        assignedContactId: contact.id,
      },
    });
    couponCode = coupon.code;
  }

  pushContactToOmnisend(email, { firstName: contact.name ?? undefined }).catch((err) =>
    console.error("Omnisend push failed", err)
  );

  const unsubscribeUrl = getStorefrontUrl(store.brandDomain, `/unsubscribe?token=${signUnsubscribeToken(contact.id)}`);

  await sendTemplate(store.organizationId, "newsletter_subscribed", email, {
    customerName: contact.name || email,
    couponCode,
    unsubscribeFooterHtml: unsubscribeFooterHtml(unsubscribeUrl),
  }).catch((err) => console.error("Newsletter confirmation email failed", err));

  return NextResponse.json({ ok: true, couponCode });
}
