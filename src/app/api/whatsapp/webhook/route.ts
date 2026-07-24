import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWhatsAppSignature } from "@/lib/whatsapp";

// One webhook URL, shared across every organization — Meta's verification
// handshake resolves which org by matching `hub.verify_token` against
// each connected WhatsAppConfig; incoming messages resolve by matching
// the payload's `phone_number_id` instead. Neither needs an org id in the
// URL itself, which keeps the setup instructions the same for everyone.
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const config = await prisma.whatsAppConfig.findFirst({ where: { verifyToken: token } });
  if (!config) {
    return new NextResponse("Verification token mismatch", { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256");

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;

  if (!phoneNumberId) {
    // Status-only callbacks (delivered/read receipts) or something we
    // don't recognize — acknowledge so Meta doesn't retry, do nothing else.
    return NextResponse.json({ ok: true });
  }

  const config = await prisma.whatsAppConfig.findFirst({ where: { phoneNumberId } });
  if (!config) {
    return NextResponse.json({ error: "Unknown phone number id" }, { status: 404 });
  }

  if (!verifyWhatsAppSignature(rawBody, config.appSecret, signatureHeader)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const incomingMessages: any[] = value?.messages ?? [];
  if (incomingMessages.length === 0) {
    // Delivery/read status update, not a new message — nothing to store.
    return NextResponse.json({ ok: true });
  }

  const contactProfile = value?.contacts?.[0]?.profile?.name as string | undefined;

  for (const msg of incomingMessages) {
    const from: string = msg.from;
    const body: string = msg.text?.body ?? `[${msg.type}]`;

    const conversation = await prisma.conversation.upsert({
      where: {
        organizationId_channel_contactPhone: {
          organizationId: config.organizationId,
          channel: "WHATSAPP",
          contactPhone: from,
        },
      },
      update: { lastMessageAt: new Date(), status: "OPEN", contactName: contactProfile ?? undefined },
      create: {
        organizationId: config.organizationId,
        channel: "WHATSAPP",
        contactPhone: from,
        contactName: contactProfile,
        status: "OPEN",
      },
    });

    await prisma.message.upsert({
      where: { externalId: msg.id },
      update: {},
      create: {
        conversationId: conversation.id,
        direction: "INBOUND",
        body,
        externalId: msg.id,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
