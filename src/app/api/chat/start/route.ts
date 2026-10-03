import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { pushNotifyContactForm } from "@/lib/push-notify";
import { sendTemplate } from "@/lib/email";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { publicKey, name, email, phone, message, pageUrl } = body;

    if (!publicKey || !message?.trim()) {
      return NextResponse.json({ error: "publicKey and message are required" }, { status: 400, headers: CORS });
    }

    const trackingConfig = await prisma.trackingConfig.findUnique({
      where: { publicKey },
      include: { brand: { include: { organization: true } } },
    });

    if (!trackingConfig) {
      return NextResponse.json({ error: "Invalid public key" }, { status: 401, headers: CORS });
    }

    const { brand } = trackingConfig;
    const { organization } = brand;
    const chatToken = randomBytes(32).toString("hex");

    const conversation = await prisma.conversation.create({
      data: {
        organizationId: organization.id,
        brandId: brand.id,
        channel: "LIVE_CHAT",
        contactName: name || null,
        contactEmail: email || null,
        contactPhone: phone || null,
        chatToken,
        pageUrl: pageUrl || null,
        messages: {
          create: {
            direction: "INBOUND",
            body: message.trim(),
          },
        },
      },
    });

    pushNotifyContactForm({
      name: name || email || phone || "Visitor",
      email: email || "",
      preview: message.trim().slice(0, 200),
      conversationId: conversation.id,
    }).catch(() => {});

    if (organization.notifyEmail) {
      const crmUrl = process.env.NEXTAUTH_URL || "";
      sendTemplate(organization.id, "contact_form_received", organization.notifyEmail, {
        name: name || email || phone || "Visitor",
        email: email || "N/A",
        subject: "Live chat started",
        message: message.trim(),
        conversationUrl: crmUrl ? `${crmUrl}/support/${conversation.id}` : "",
      }).catch(() => {});
    }

    return NextResponse.json({ conversationId: conversation.id, chatToken }, { headers: CORS });
  } catch (err) {
    console.error("[chat/start]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS });
  }
}
