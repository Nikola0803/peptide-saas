"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage, verifyWhatsAppCredentials, getDisplayPhoneNumber } from "@/lib/whatsapp";

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

export async function sendReply(conversationId: string, formData: FormData) {
  const { organization } = await requireOrg();

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: organization.id },
  });
  if (!conversation) throw new Error("Conversation not found");
  if (conversation.channel !== "WHATSAPP" || !conversation.contactPhone) {
    throw new Error("Replies are only supported for WhatsApp conversations");
  }

  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("Message can't be empty");

  const config = await prisma.whatsAppConfig.findUnique({ where: { organizationId: organization.id } });
  if (!config) throw new Error("WhatsApp isn't connected");

  const { messageId } = await sendWhatsAppMessage(config.phoneNumberId, config.accessToken, conversation.contactPhone, body);

  await prisma.message.create({
    data: { conversationId, direction: "OUTBOUND", body, externalId: messageId || undefined },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });

  revalidatePath(`/support/${conversationId}`);
  revalidatePath("/support");
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
