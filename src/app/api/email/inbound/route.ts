import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

// POST /api/email/inbound
//
// Resend inbound email webhook. Set up:
//   1. Upgrade to Resend Pro, then add domain inbound.evlvpeptides.com under
//      Inbound in the Resend dashboard.
//   2. Add the MX record Resend provides for `inbound` in Cloudflare DNS
//      (Name: inbound, NOT @  — leaves root MX / Spacemail untouched).
//   3. Create a catch-all route → https://crm.evlvpeptides.com/api/email/inbound
//      and copy the signing secret.
//   4. Set on the VPS .env:
//        INBOUND_EMAIL_DOMAIN=inbound.evlvpeptides.com
//        INBOUND_EMAIL_ORG_ID=<org id>
//        RESEND_INBOUND_SECRET=<signing secret from step 3>
//      then: npm run build && pm2 restart all
//
// Thread matching: CRM reply emails set Reply-To: support+<conversationId>@<INBOUND_EMAIL_DOMAIN>
// Email clients preserve that address when the customer hits Reply, so the
// conversation ID arrives in the To/recipient field here.

function verifySignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const sig = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function extractAddress(addr: string): string {
  const match = addr.match(/<([^>]+)>/);
  return (match ? match[1] : addr).trim().toLowerCase();
}

function extractConversationId(toAddresses: string[]): string | null {
  for (const addr of toAddresses) {
    const local = extractAddress(addr).split("@")[0];
    const plusIdx = local.indexOf("+");
    if (plusIdx !== -1) return local.slice(plusIdx + 1);
  }
  return null;
}

function plainText(data: { text?: string; html?: string }): string {
  if (data.text) return data.text.trim();
  if (data.html) return data.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return "";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const secret = process.env.RESEND_INBOUND_SECRET;
  if (secret) {
    const sig = req.headers.get("resend-signature") || req.headers.get("x-resend-signature");
    if (!verifySignature(rawBody, sig, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const toAddresses: string[] = Array.isArray(data.to)
    ? (data.to as string[])
    : typeof data.to === "string"
      ? [data.to]
      : [];

  const fromRaw = typeof data.from === "string" ? data.from : "";
  const fromEmail = extractAddress(fromRaw);
  const subject = typeof data.subject === "string" ? data.subject : null;
  const body = plainText(data as { text?: string; html?: string }).slice(0, 5000);

  if (!body) {
    return NextResponse.json({ ok: true, action: "empty" });
  }

  // Try to match an existing conversation via plus-addressing
  const conversationId = extractConversationId(toAddresses);
  if (conversationId) {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (conversation) {
      await prisma.$transaction([
        prisma.message.create({ data: { conversationId, direction: "INBOUND", body } }),
        prisma.conversation.update({
          where: { id: conversationId },
          data: { status: "OPEN", lastMessageAt: new Date() },
        }),
      ]);
      return NextResponse.json({ ok: true, action: "appended", conversationId });
    }
  }

  // No matched conversation — create a fresh one for this org
  const orgId = process.env.INBOUND_EMAIL_ORG_ID;
  if (!orgId) {
    console.warn("[email/inbound] No INBOUND_EMAIL_ORG_ID set — cannot create conversation for unmatched email");
    return NextResponse.json({ ok: true, action: "skipped_no_org" });
  }

  const brand = await prisma.brand.findFirst({ where: { organizationId: orgId } });

  await prisma.conversation.create({
    data: {
      organizationId: orgId,
      brandId: brand?.id ?? null,
      channel: "CONTACT_FORM",
      contactEmail: fromEmail || null,
      subject: subject ?? null,
      status: "OPEN",
      messages: {
        create: { direction: "INBOUND", body },
      },
    },
  });

  return NextResponse.json({ ok: true, action: "created" });
}
