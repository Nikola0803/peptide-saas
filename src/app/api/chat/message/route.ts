import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    const { conversationId, chatToken, message } = body;

    if (!conversationId || !chatToken || !message?.trim()) {
      return NextResponse.json({ error: "conversationId, chatToken, and message are required" }, { status: 400, headers: CORS });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, chatToken },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401, headers: CORS });
    }

    const msg = await prisma.message.create({
      data: { conversationId, direction: "INBOUND", body: message.trim() },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    // Fire push notifications to all subscribed devices for this org (non-blocking)
    sendPushToOrg(conversation.organizationId, {
      title: "New live chat message",
      body: message.trim().slice(0, 100),
      url: `/support/${conversationId}`,
    }).catch((err) => console.error("[push]", err));

    return NextResponse.json({ ok: true, messageId: msg.id, createdAt: msg.createdAt }, { headers: CORS });
  } catch (err) {
    console.error("[chat/message]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS });
  }
}

async function sendPushToOrg(organizationId: string, payload: { title: string; body: string; url: string }) {
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidEmail = process.env.VAPID_EMAIL || "mailto:office@evlvpeptides.com";

  if (!vapidPrivate || !vapidPublic) return;

  const { default: webPush } = await import("web-push");
  webPush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);

  const subs = await prisma.pushSubscription.findMany({ where: { organizationId } });

  await Promise.allSettled(
    subs.map((sub) =>
      webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      ).catch(async (err: any) => {
        // Remove expired/invalid subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      })
    )
  );
}
