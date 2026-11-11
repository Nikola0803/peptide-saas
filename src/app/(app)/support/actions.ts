"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage, verifyWhatsAppCredentials, getDisplayPhoneNumber } from "@/lib/whatsapp";
import { sendTemplate } from "@/lib/email";

export async function saveWhatsAppConfig(formData: FormData) {
  const { organization } = await requireOrg();

  const phoneNumberId = String(formData.get("phoneNumberId") ?? "").trim();
  const accessToken = String(formData.get("accessToken") ?? "").trim();
  const appSecret = String(formData.get("appSecret") ?? "").trim();
  const verifyToken = String(formData.get("verifyToken") ?? "").trim();

  if (!phoneNumberId || !accessToken || !appSecret || !verifyToken) {
    throw new Error("All four fields are required");
  }

  await verifyWhatsAppCredentials(phoneNumberId, accessToken);
  const displayPhone = await getDisplayPhoneNumber(phoneNumberId, accessToken);

  await prisma.whatsAppConfig.upsert({
    where: { organizationId: organization.id },
    update: { phoneNumberId, accessToken, appSecret, verifyToken, businessDisplayPhone: displayPhone },
    create: { organizationId: organization.id, phoneNumberId, accessToken, appSecret, verifyToken, businessDisplayPhone: displayPhone },
  });

  revalidatePath("/support");
}

export async function disconnectWhatsApp() {
  const { organization } = await requireOrg();
  await prisma.whatsAppConfig.deleteMany({ where: { organizationId: organization.id } });
  revalidatePath("/support");
}

export async function sendReply(conversationId: string, formData: FormData): Promise<{ emailWarning?: string }> {
  const { organization } = await requireOrg();

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: organization.id },
  });
  if (!conversation) throw new Error("Conversation not found");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("Message can't be empty");

  // Pre-flight validation before touching the DB
  if (conversation.channel === "CONTACT_FORM" && !conversation.contactEmail) {
    throw new Error("This conversation has no email address on file");
  }

  let externalId: string | undefined;

  if (conversation.channel === "WHATSAPP") {
    if (!conversation.contactPhone) throw new Error("This conversation has no phone number on file");
    const config = await prisma.whatsAppConfig.findUnique({ where: { organizationId: organization.id } });
    if (!config) throw new Error("WhatsApp isn't connected");
    const sent = await sendWhatsAppMessage(config.phoneNumberId, config.accessToken, conversation.contactPhone, body);
    externalId = sent.messageId || undefined;
  } else if (conversation.channel === "LIVE_CHAT") {
    // Widget polls /api/chat/messages — just store the outbound message,
    // no external send needed.
  } else if (conversation.channel !== "CONTACT_FORM") {
    throw new Error("Replies aren't supported for this conversation's channel");
  }

  await prisma.message.create({
    data: { conversationId, direction: "OUTBOUND", body, externalId },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });

  revalidatePath(`/support/${conversationId}`);
  revalidatePath("/support");

  // Send email after message is persisted so a Resend failure never loses the reply
  if (conversation.channel === "CONTACT_FORM" && conversation.contactEmail) {
    const replyHtml = body
      .split(/\n+/)
      .map((line) => `<p>${line}</p>`)
      .join("");
    const emailSent = await sendTemplate(organization.id, "support_reply", conversation.contactEmail, {
      subject: conversation.subject ?? "your message",
      replyHtml,
    });
    if (!emailSent) {
      return { emailWarning: "Reply saved — but the email failed to send. Check Resend logs." };
    }
  }

  return {};
}

export async function setConversationStatus(conversationId: string, status: "OPEN" | "CLOSED") {
  const { organization } = await requireOrg();

  await prisma.conversation.update({
    where: { id: conversationId, organizationId: organization.id },
    data: { status },
  });

  revalidatePath(`/support/${conversationId}`);
  revalidatePath("/support");
}
