import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDM, sendPrivateReply, replyToComment, getSenderUsername } from "@/lib/instagram";
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
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    console.error("[ig-webhook] Failed to parse body:", err);
    return NextResponse.json({ ok: true });
  }
  console.log("[ig-webhook] Received:", JSON.stringify(body));
  processEvent(body as MetaPayload).catch((err) => console.error("[ig-webhook] processEvent error:", err));
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
      message?: {
        mid: string;
        text?: string;
        attachments?: Array<{ type: string; payload?: Record<string, unknown> }>;
      };
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
  if (body.object !== "instagram") {
    console.log("[ig-webhook] Skipping — object is:", body.object);
    return;
  }
  for (const entry of body.entry ?? []) {
    const igUserId = entry.id;
    console.log("[ig-webhook] Entry igUserId:", igUserId, "changes:", entry.changes?.map(c => c.field), "messaging:", entry.messaging?.length ?? 0);
    const account = await prisma.instagramAccount.findFirst({
      where: { igUserId, active: true },
      include: { automations: { where: { active: true } } },
    });
    if (!account) {
      console.log("[ig-webhook] No account found for igUserId:", igUserId);
      continue;
    }
    console.log("[ig-webhook] Matched account:", account.username, "automations:", account.automations.length);

    for (const change of entry.changes ?? []) {
      console.log("[ig-webhook] Processing change field:", change.field, "value:", JSON.stringify(change.value));
      if (change.field === "comments") await handleComment(account, change.value as CommentValue);
      if (change.field === "follows") await handleFollow(account, change.value as { id: string });
    }
    for (const msg of entry.messaging ?? []) {
      const attachmentTypes = msg.message?.attachments?.map((a) => a.type) ?? [];
      const isStoryInteraction = attachmentTypes.some((t) => ["story_mention", "story_reply", "share"].includes(t));
      console.log("[ig-webhook] Processing message from:", msg.sender.id, "text:", msg.message?.text, "attachments:", attachmentTypes);
      if (isStoryInteraction) {
        await handleStoryReaction(account, msg.sender.id, msg.message?.text ?? "");
      } else if (msg.message?.text) {
        await handleDM(account, msg.sender.id, msg.message.text);
      }
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

  // Look up the sender's username once for use in message interpolation
  const senderUsername = await getSenderUsername(account.accessToken, senderId);
  const displayName = senderUsername ?? senderId;

  // ------------------------------------------------------------------
  // FIRST_DM — fires once, ever, the first time someone messages this account
  // ------------------------------------------------------------------
  const firstDmAutomations = account.automations.filter((a) => a.trigger === "FIRST_DM");
  if (firstDmAutomations.length > 0) {
    // Has this person ever triggered a FIRST_DM for this account?
    const alreadyWelcomed = await prisma.instagramEvent.findFirst({
      where: { accountId: account.id, fromIgUserId: senderId, triggerType: "FIRST_DM" },
    });

    if (!alreadyWelcomed) {
      const contact = await captureContact(account.organizationId, senderId, senderUsername);
      for (const auto of firstDmAutomations) {
        const message = interpolate(auto.dmMessage, { username: displayName });
        let dmSent = false;
        let dmError: string | undefined;
        try {
          await sendDM(account.accessToken, account.igUserId, senderId, message);
          dmSent = true;
        } catch (err) {
          dmError = err instanceof Error ? err.message : "Unknown error";
        }
        await prisma.instagramEvent.create({
          data: {
            accountId: account.id,
            automationId: auto.id,
            triggerType: "FIRST_DM",
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
  }

  // ------------------------------------------------------------------
  // DM_KEYWORD — fires whenever the keyword appears in a DM
  // ------------------------------------------------------------------
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

    const message = interpolate(auto.dmMessage, { username: displayName });
    let dmSent = false;
    let dmError: string | undefined;

    try {
      await sendDM(account.accessToken, account.igUserId, senderId, message);
      dmSent = true;
    } catch (err) {
      dmError = err instanceof Error ? err.message : "Unknown error";
    }

    const contact = await captureContact(account.organizationId, senderId, senderUsername);

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
// Follow trigger — capture new follower as CRM contact
// ---------------------------------------------------------------------------

async function handleFollow(account: AccountWithAutomations, value: { id: string }) {
  const followerId = value.id;
  if (!followerId || followerId === account.igUserId) return;
  console.log("[ig-webhook] New follower:", followerId, "for account:", account.username);

  const username = await getSenderUsername(account.accessToken, followerId);
  await captureContact(account.organizationId, followerId, username);

  // Fire any STORY_REACTION automations that also act as follow welcome? No —
  // keep follow as contact-only for now (DM requires Meta beta permission).
}

// ---------------------------------------------------------------------------
// Story reaction trigger
// ---------------------------------------------------------------------------

async function handleStoryReaction(account: AccountWithAutomations, senderId: string, text: string) {
  if (!senderId || senderId === account.igUserId) return;

  const senderUsername = await getSenderUsername(account.accessToken, senderId);
  const displayName = senderUsername ?? senderId;

  const contact = await captureContact(account.organizationId, senderId, senderUsername);

  for (const auto of account.automations) {
    if (auto.trigger !== "STORY_REACTION") continue;

    if (auto.cooldownHours > 0) {
      const cutoff = new Date(Date.now() - auto.cooldownHours * 3_600_000);
      const recent = await prisma.instagramEvent.findFirst({
        where: { automationId: auto.id, fromIgUserId: senderId, dmSent: true, createdAt: { gte: cutoff } },
      });
      if (recent) continue;
    }

    const message = interpolate(auto.dmMessage, { username: displayName });
    let dmSent = false;
    let dmError: string | undefined;

    try {
      await sendDM(account.accessToken, account.igUserId, senderId, message);
      dmSent = true;
    } catch (err) {
      dmError = err instanceof Error ? err.message : "Unknown error";
    }

    await prisma.instagramEvent.create({
      data: {
        accountId: account.id,
        automationId: auto.id,
        triggerType: "STORY_REACTION",
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
