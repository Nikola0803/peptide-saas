import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

// POST /api/email/inbound
//
// Accepts inbound email webhooks from Mailgun HTTP routes or a JSON forwarder.
//
// Mailgun setup (recommended — subdomain-only MX, doesn't touch root domain):
//   1. Add domain inbound.evlvpeptides.com in Mailgun dashboard.
//   2. Add Mailgun's MX records for `inbound` in Cloudflare DNS only.
//   3. Create a Mailgun Receiving Route: catch-all → forward to this URL.
//   4. Set MAILGUN_WEBHOOK_SECRET=<signing key from Mailgun → Webhooks>.
//   5. Set INBOUND_EMAIL_DOMAIN=inbound.evlvpeptides.com and
//      INBOUND_EMAIL_ORG_ID=<org id> in the VPS .env, then rebuild.
//
// Thread matching: CRM reply emails set Reply-To: support+<conversationId>@<INBOUND_EMAIL_DOMAIN>
// When a customer replies, their email client preserves that address in To/recipient,
// so the conversation ID arrives here and the reply threads into the right conversation.

function verifyHmac(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const sig = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function verifyMailgunSignature(params: URLSearchParams, secret: string): boolean {
  const timestamp = params.get("timestamp") ?? "";
  const token = params.get("token") ?? "";
  const signature = params.get("signature") ?? "";
  if (!timestamp || !token || !signature) return false;
  const expected = createHmac("sha256", secret).update(timestamp + token).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
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

interface NormalizedEmail {
  toAddresses: string[];
  fromEmail: string;
  subject: string | null;
  body: string;
}

function parseMailgunParams(params: URLSearchParams): NormalizedEmail {
  const recipient = params.get("recipient") ?? "";
  const sender = params.get("sender") ?? "";
  // Prefer stripped-text: Mailgun removes quoted reply history from it
  const bodyText = params.get("stripped-text") || params.get("body-plain") || "";
  const bodyHtml = params.get("stripped-html") || params.get("body-html") || "";
  return {
    toAddresses: recipient ? [recipient] : [],
    fromEmail: extractAddress(sender),
    subject: params.get("subject") || null,
    body: plainText({ text: bodyText || undefined, html: bodyHtml || undefined }).slice(0, 5000),
  };
}

function parseJsonPayload(data: Record<string, unknown>): NormalizedEmail {
  const toAddresses: string[] = Array.isArray(data.to)
    ? (data.to as string[])
    : typeof data.to === "string"
      ? [data.to]
      : [];
  const fromRaw = typeof data.from === "string" ? data.from : "";
  return {
    toAddresses,
    fromEmail: extractAddress(fromRaw),
    subject: typeof data.subject === "string" ? data.subject : null,
    body: plainText(data as { text?: string; html?: string }).slice(0, 5000),
  };
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  const rawBody = await req.text();

  let normalized: NormalizedEmail;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    // Mailgun HTTP route payload
    const params = new URLSearchParams(rawBody);
    const mailgunSecret = process.env.MAILGUN_WEBHOOK_SECRET;
    if (mailgunSecret && !verifyMailgunSignature(params, mailgunSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    normalized = parseMailgunParams(params);
  } else {
    // JSON payload (Cloudflare Worker forwarder or future provider)
    const secret = process.env.RESEND_INBOUND_SECRET;
    if (secret) {
      const sig = req.headers.get("resend-signature") || req.headers.get("x-resend-signature");
      if (!verifyHmac(rawBody, sig, secret)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    normalized = parseJsonPayload(data);
  }

  const { toAddresses, fromEmail, subject, body } = normalized;

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
