import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/customer-auth";

export const runtime = "nodejs";

// GET /api/store/newsletter/unsubscribe?token=... -- the link clicked from
// inside a marketing email (see the unsubscribe footer built in
// src/lib/email.ts and the bulk sender in email-marketing/newsletter/
// actions.ts). No x-store-domain/x-store-api-key handshake here on
// purpose: this link is meant to work standing alone, straight from an
// email client, without evlv-site's server proxying it first -- the
// signed token IS the auth. evlv-site's own /unsubscribe page calls this
// directly (server-side) and renders the result.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const claims = verifyUnsubscribeToken(token);
  if (!claims) {
    return NextResponse.json({ error: "Invalid or expired unsubscribe link" }, { status: 400 });
  }

  const contact = await prisma.contact.update({
    where: { id: claims.contactId },
    data: { marketingOptIn: false },
    select: { email: true },
  }).catch(() => null);

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, email: contact.email });
}
