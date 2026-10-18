import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDM, sendPrivateReply, replyToComment } from "@/lib/instagram";
import type { InstagramTrigger } from "@prisma/client";

// GET — Meta webhook verification challenge
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// POST — Incoming events from Meta
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    processEvent(body).catch((err) => console.error("[instagram-webhook]", err));
  } catch {
    // ignore parse errors — return 200 so Meta doesn't retry
  }
  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------

type MetaPayload = {
  object: string;
  entry: Array<{
    id: string;
    time: number;
    changes?: Array<{ field: string; value: Record<string, unknown> }>;
    messaging?: Array<{
      sender: { id: string };
      recipient: { id: string };
      message?: { mid: string; text: string };
    }>;
  }>;
};

async function processEvent(body: MetaPayload) {
  if (body.object !== "instagram") return;

  for (const entry of body.entry ?? []) {
    const igUserId = entry.id;

    const account = await prisma.instagramAccount.findFirst({
      where: { igUserId, active: true },
      include: { automations: { where: { active: true } } },
    });
    if (!account) continue;

    // Comment events
    for (const change of entry.changes ?? []) {
      if (change.field === "comments") {
        await handleComment(account, change.value as CommentValue);
      }
    }

    // Messaging events (DMs)
    for (const msg of entry.messaging ?? []) {
      if (msg.message?.text) {
        await handleDM(account, msg.sender.id, msg.message.text);
      }
    }
  }
}

type CommentValue = {
  id: string;
  text: string;
  from: { id: string; username?: string };
  media: { id: string };
  parent_id?: string;
};

async function handleComment(account: Awaited<ReturnType<typeof getAccount>>, value: CommentValue) {
  const commentId = value.id;
  const commentText = value.text ?? "";
  const senderId = value.from?.id ?? "";
  const mediaId = value.media?.id ?? "";
  const senderUsername = value.from?.username;

  // Ignore replies to own comments and own account's posts
  if (!senderId || senderId === account.igUserId) return;
  // Ignore replies to other comments
  if (value.parent_id) return;

  const textLower = commentText.toLowerCase().trim();

  for (const auto of account.automations) {
    const isCommentTrigger = auto.trigger === "COMMENT_KEYWORD" || auto.trigger === "ANY_COMMENT";
    if (!isCommentTrigger) continue;

    if (auto.trigger === "COMMENT_KEYWORD") {
      if (!auto.keyword) continue;
      if (!textLower.includes(auto.keyword.toLowerCase())) continue;
    }

    // Dedup — don't send the same automation twice to the same comment
    const exists = await prisma.instagramEvent.findFirst({
      where: { commentId, automationId: auto.id },
    });
    if (exists) continue;

    let dmSent = false;
    let dmError: string | undefined;

    try {
      // Try private reply (linked to comment) first, fall back to plain DM
      await sendPrivateReply(account.accessToken, account.igUserId, commentId, auto.dmMessage);
      dmSent = true;
    } catch {
      try {
        await sendDM(account.accessToken, account.igUserId, senderId, auto.dmMessage);
        dmSent = true;
      } catch (err) {
        dmError = err instanceof Error ? err.message : "Unknown error";
      }
    }

    // Optional public reply
    if (auto.publicReply && dmSent) {
      replyToComment(account.accessToken, commentId, auto.publicReply).catch((e) =>
        console.error("[ig] public reply failed:", e)
      );
    }

    await prisma.instagramEvent.create({
      data: {
        accountId: account.id,
        automationId: auto.id,
        triggerType: auto.trigger as InstagramTrigger,
        fromIgUserId: senderId,
        igUsername: senderUsername,
        commentId,
        commentText,
        mediaId,
        dmSent,
        dmError,
      },
    });

    await prisma.instagramAutomation.update({
      where: { id: auto.id },
      data: { triggerCount: { increment: 1 } },
    });
  }
}

async function handleDM(account: Awaited<ReturnType<typeof getAccount>>, senderId: string, text: string) {
  if (!senderId || senderId === account.igUserId) return;

  const textLower = text.toLowerCase().trim();

  for (const auto of account.automations) {
    if (auto.trigger !== "DM_KEYWORD") continue;
    if (!auto.keyword) continue;
    if (!textLower.includes(auto.keyword.toLowerCase())) continue;

    // Dedup within 60 seconds to avoid double-firing
    const exists = await prisma.instagramEvent.findFirst({
      where: {
        automationId: auto.id,
        fromIgUserId: senderId,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (exists) continue;

    let dmSent = false;
    let dmError: string | undefined;

    try {
      await sendDM(account.accessToken, account.igUserId, senderId, auto.dmMessage);
      dmSent = true;
    } catch (err) {
      dmError = err instanceof Error ? err.message : "Unknown error";
    }

    await prisma.instagramEvent.create({
      data: {
        accountId: account.id,
        automationId: auto.id,
        triggerType: "DM_KEYWORD",
        fromIgUserId: senderId,
        commentText: text,
        dmSent,
        dmError,
      },
    });

    await prisma.instagramAutomation.update({
      where: { id: auto.id },
      data: { triggerCount: { increment: 1 } },
    });
  }
}

// Helper type — prisma includes
type GetAccountResult = {
  id: string;
  igUserId: string;
  accessToken: string;
  automations: Array<{
    id: string;
    trigger: string;
    keyword: string | null;
    dmMessage: string;
    publicReply: string | null;
    triggerCount: number;
  }>;
};
type getAccount = () => Promise<GetAccountResult>;
