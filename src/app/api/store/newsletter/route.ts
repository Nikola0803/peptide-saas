import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { subscribeToMailchimp } from "@/lib/mailchimp";

export const runtime = "nodejs";

// POST /api/store/newsletter — called by evlv-site's server-only proxy
// (same x-store-domain/x-store-api-key auth as /api/store/checkout).
// Marks Contact.marketingOptIn = true (the same flag the in-house
// Newsletter sender reads from) and, best-effort, pushes the subscriber to
// Mailchimp too so a Mailchimp-side campaign tool has the same list.
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

  const mailchimp = await subscribeToMailchimp(email, { firstName: contact.name || undefined });

  return NextResponse.json({ ok: true, mailchimp: mailchimp.ok });
}
