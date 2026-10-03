import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");
    const chatToken = searchParams.get("chatToken");
    const after = searchParams.get("after");

    if (!conversationId || !chatToken) {
      return NextResponse.json({ error: "conversationId and chatToken are required" }, { status: 400, headers: CORS });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, chatToken },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401, headers: CORS });
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        ...(after ? { createdAt: { gt: new Date(after) } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, direction: true, body: true, createdAt: true },
    });

    return NextResponse.json({ messages }, { headers: CORS });
  } catch (err) {
    console.error("[chat/messages]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS });
  }
}
