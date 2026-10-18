"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { verifyAndFetchAccount } from "@/lib/instagram";
import type { InstagramTrigger } from "@prisma/client";

export async function connectInstagramAccount(formData: FormData) {
  const { organization } = await requireOrg();

  const igUserId = String(formData.get("igUserId") ?? "").trim();
  const accessToken = String(formData.get("accessToken") ?? "").trim();
  if (!igUserId || !accessToken) throw new Error("Instagram User ID and Access Token are required");

  // Verify the token works
  const info = await verifyAndFetchAccount(accessToken, igUserId);

  await prisma.instagramAccount.upsert({
    where: { igUserId },
    update: { accessToken, username: info.username, name: info.name, active: true, organizationId: organization.id },
    create: {
      organizationId: organization.id,
      igUserId,
      accessToken,
      username: info.username,
      name: info.name,
    },
  });

  revalidatePath("/instagram");
}

export async function disconnectInstagramAccount(accountId: string) {
  const { organization } = await requireOrg();
  await prisma.instagramAccount.deleteMany({ where: { id: accountId, organizationId: organization.id } });
  revalidatePath("/instagram");
}

export async function toggleInstagramAccount(accountId: string, active: boolean) {
  const { organization } = await requireOrg();
  await prisma.instagramAccount.updateMany({ where: { id: accountId, organizationId: organization.id }, data: { active } });
  revalidatePath("/instagram");
}

export async function createAutomation(accountId: string, formData: FormData) {
  const { organization } = await requireOrg();

  const account = await prisma.instagramAccount.findFirst({ where: { id: accountId, organizationId: organization.id } });
  if (!account) throw new Error("Account not found");

  const name = String(formData.get("name") ?? "").trim();
  const trigger = String(formData.get("trigger") ?? "") as InstagramTrigger;
  const keyword = String(formData.get("keyword") ?? "").trim() || null;
  const dmMessage = String(formData.get("dmMessage") ?? "").trim();
  const publicReply = String(formData.get("publicReply") ?? "").trim() || null;

  if (!name) throw new Error("Name is required");
  if (!dmMessage) throw new Error("DM message is required");
  if ((trigger === "COMMENT_KEYWORD" || trigger === "DM_KEYWORD") && !keyword) {
    throw new Error("Keyword is required for this trigger type");
  }

  await prisma.instagramAutomation.create({
    data: { accountId, name, trigger, keyword, dmMessage, publicReply },
  });

  revalidatePath("/instagram");
}

export async function updateAutomation(automationId: string, formData: FormData) {
  const { organization } = await requireOrg();

  const automation = await prisma.instagramAutomation.findFirst({
    where: { id: automationId, account: { organizationId: organization.id } },
  });
  if (!automation) throw new Error("Not found");

  const name = String(formData.get("name") ?? "").trim();
  const trigger = String(formData.get("trigger") ?? "") as InstagramTrigger;
  const keyword = String(formData.get("keyword") ?? "").trim() || null;
  const dmMessage = String(formData.get("dmMessage") ?? "").trim();
  const publicReply = String(formData.get("publicReply") ?? "").trim() || null;

  await prisma.instagramAutomation.update({
    where: { id: automationId },
    data: { name, trigger, keyword, dmMessage, publicReply },
  });

  revalidatePath("/instagram");
}

export async function toggleAutomation(automationId: string, active: boolean) {
  const { organization } = await requireOrg();
  const automation = await prisma.instagramAutomation.findFirst({
    where: { id: automationId, account: { organizationId: organization.id } },
  });
  if (!automation) throw new Error("Not found");
  await prisma.instagramAutomation.update({ where: { id: automationId }, data: { active } });
  revalidatePath("/instagram");
}

export async function deleteAutomation(automationId: string) {
  const { organization } = await requireOrg();
  const automation = await prisma.instagramAutomation.findFirst({
    where: { id: automationId, account: { organizationId: organization.id } },
  });
  if (!automation) throw new Error("Not found");
  await prisma.instagramAutomation.delete({ where: { id: automationId } });
  revalidatePath("/instagram");
}
