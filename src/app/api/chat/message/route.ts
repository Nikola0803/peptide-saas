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

    return NextResponse.json({ ok: true, messageId: msg.id, createdAt: msg.createdAt }, { headers: CORS });
  } catch (err) {
    console.error("[chat/message]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS });
  }
}
