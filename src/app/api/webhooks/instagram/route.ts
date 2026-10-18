import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDM, sendPrivateReply, replyToComment } from "@/lib/instagram";
import type { InstagramTrigger } from "@prisma/client";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    processEvent(body).catch((err) => console.error("[instagram-webhook]", err));
  } catch {
    // ignore parse errors
  }
  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------

type MetaPayload = {
  object: string;
  entry: Array<{
    id: string;
    changes?: Array<{ field: string; value: Record<string, unknown> }>;
    messaging?: Array<{
      sender: { id: string };
      recipient: { id: string };
      message?: { mid: string; text: string };
    }>;
  }>;
};

type CommentValue = {
  id: string;
  text: string;
  from: { id: string; username?: string };
  media: { id: string };
  parent_id?: string;
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

    for (const change of entry.changes ?? []) {
      if (change.field === "comments") await handleComment(account, change.value as CommentValue);
    }
    for (const msg of entry.messaging ?? []) {
      if (msg.message?.text) await handleDM(account, msg.sender.id, msg.message.text);
    }
  }
}

// ---------------------------------------------------------------------------
// Comment trigger
// ---------------------------------------------------------------------------

async function handleComment(account: AccountWithAutomations, value: CommentValue) {
  const commentId = value.id;
  const commentText = value.text ?? "";
  const senderId = value.from?.id ?? "";
  const senderUsername = value.from?.username;
  const mediaId = value.media?.id ?? "";

  if (!senderId || senderId === account.igUserId) return;
  if (value.parent_id) return; // ignore replies to comments

  const textLower = commentText.toLowerCase().trim();

  for (const auto of account.automations) {
    const isCommentTrigger = auto.trigger === "COMMENT_KEYWORD" || auto.trigger === "ANY_COMMENT";
    if (!isCommentTrigger) continue;

    // Keyword check
    if (auto.trigger === "COMMENT_KEYWORD") {
      if (!auto.keyword) continue;
      if (!textLower.includes(auto.keyword.toLowerCase())) continue;
    }

    // Per-post filter
    if (auto.postId && auto.postId !== mediaId) continue;

    // Dedup — same comment never fires same automation twice
    const exists = await prisma.instagramEvent.findFirst({ where: { commentId, automationId: auto.id } });
    if (exists) continue;

    // Cooldown — don't DM same person again within cooldownHours
    if (auto.cooldownHours > 0) {
      const cutoff = new Date(Date.now() - auto.cooldownHours * 3_600_000);
      const recent = await prisma.instagramEvent.findFirst({
        where: { automationId: auto.id, fromIgUserId: senderId, dmSent: true, createdAt: { gte: cutoff } },
      });
      if (recent) continue;
    }

    const message = interpolate(auto.dmMessage, { username: senderUsername ?? senderId });
    let dmSent = false;
    let dmError: string | undefined;

    try {
      await sendPrivateReply(account.accessToken, account.igUserId, commentId, message);
      dmSent = true;
    } catch {
      try {
        await sendDM(account.accessToken, account.igUserId, senderId, message);
        dmSent = true;
      } catch (err) {
        dmError = err instanceof Error ? err.message : "Unknown error";
      }
    }

    if (auto.publicReply && dmSent) {
      const pubReply = interpolate(auto.publicReply, { username: senderUsername ?? senderId });
      replyToComment(account.accessToken, commentId, pubReply).catch(() => null);
    }

    // Auto-capture contact in CRM
    const contact = await captureContact(account.organizationId, senderId, senderUsername);

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
        contactId: contact?.id,
        dmSent,
        dmError,
      },
    });
    await prisma.instagramAutomation.update({ where: { id: auto.id }, data: { triggerCount: { increment: 1 } } });
  }
}

// ---------------------------------------------------------------------------
// DM keyword trigger
// ---------------------------------------------------------------------------

async function handleDM(account: AccountWithAutomations, senderId: string, text: string) {
  if (!senderId || senderId === account.igUserId) return;
  const textLower = text.toLowerCase().trim();

  for (const auto of account.automations) {
    if (auto.trigger !== "DM_KEYWORD") continue;
    if (!auto.keyword) continue;
    if (!textLower.includes(auto.keyword.toLowerCase())) continue;

    if (auto.cooldownHours > 0) {
      const cutoff = new Date(Date.now() - auto.cooldownHours * 3_600_000);
      const recent = await prisma.instagramEvent.findFirst({
        where: { automationId: auto.id, fromIgUserId: senderId, dmSent: true, createdAt: { gte: cutoff } },
      });
      if (recent) continue;
    }

    const message = interpolate(auto.dmMessage, { username: senderId });
    let dmSent = false;
    let dmError: string | undefined;

    try {
      await sendDM(account.accessToken, account.igUserId, senderId, message);
      dmSent = true;
    } catch (err) {
      dmError = err instanceof Error ? err.message : "Unknown error";
    }

    const contact = await captureContact(account.organizationId, senderId, undefined);

    await prisma.instagramEvent.create({
      data: {
        accountId: account.id,
        automationId: auto.id,
        triggerType: "DM_KEYWORD",
        fromIgUserId: senderId,
        commentText: text,
        contactId: contact?.id,
        dmSent,
        dmError,
      },
    });
    await prisma.instagramAutomation.update({ where: { id: auto.id }, data: { triggerCount: { increment: 1 } } });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

async function captureContact(organizationId: string, igUserId: string, username: string | undefined) {
  try {
    const syntheticEmail = `ig_${igUserId}@instagram.local`;
    return await prisma.contact.upsert({
      where: { instagramUserId: igUserId },
      update: { instagramUsername: username ?? undefined },
      create: {
        organizationId,
        email: syntheticEmail,
        name: username ? `@${username}` : igUserId,
        instagramUserId: igUserId,
        instagramUsername: username,
      },
    });
  } catch {
    return null;
  }
}

type AccountWithAutomations = {
  id: string;
  igUserId: string;
  accessToken: string;
  organizationId: string;
  automations: Array<{
    id: string;
    trigger: string;
    keyword: string | null;
    dmMessage: string;
    publicReply: string | null;
    postId: string | null;
    cooldownHours: number;
  }>;
};
