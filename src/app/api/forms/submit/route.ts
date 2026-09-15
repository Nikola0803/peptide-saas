import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pushNotifyContactForm } from "@/lib/push-notify";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// POST /api/forms/submit
// body: { publicKey, name?, email?, phone?, subject?, message }
//
// `publicKey` is the same per-brand key the tracking pixel uses (see
// TrackingConfig on the Tracking & Pixels page) — already safe to expose
// client-side, no reason to mint a second kind of key for this. Every
// submission becomes its own Conversation (a "ticket"), not merged into
// an existing thread, since contact-form submissions aren't really an
// ongoing back-and-forth the way WhatsApp is.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.publicKey || !body?.message) {
    return NextResponse.json({ error: "publicKey and message are required" }, { status: 400, headers: CORS_HEADERS });
  }

  const config = await prisma.trackingConfig.findUnique({
    where: { publicKey: body.publicKey },
    include: { brand: true },
  });
  if (!config) {
    return NextResponse.json({ error: "Unknown key" }, { status: 404, headers: CORS_HEADERS });
  }

  const conversation = await prisma.conversation.create({
    data: {
      organizationId: config.brand.organizationId,
      brandId: config.brandId,
      channel: "CONTACT_FORM",
      contactName: body.name || null,
      contactEmail: body.email || null,
      contactPhone: null,
      subject: body.subject || null,
      status: "OPEN",
      messages: {
        create: { direction: "INBOUND", body: String(body.message) },
      },
    },
  });

  pushNotifyContactForm({
    name: body.name || "",
    email: body.email || "",
    subject: body.subject || undefined,
    preview: String(body.message),
    conversationId: conversation.id,
  }).catch((err) => console.error("Contact form push notification failed", err));

  return NextResponse.json({ ok: true, conversationId: conversation.id }, { headers: CORS_HEADERS });
}
