"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendTemplate } from "@/lib/email";

export async function approveVerification(id: string) {
  const { organization } = await requireOrg();

  const verification = await prisma.customerVerification.findFirst({
    where: { id, organizationId: organization.id },
    include: { contact: true },
  });
  if (!verification) throw new Error("Not found");
  if (verification.status !== "PENDING") throw new Error("Already reviewed");

  await prisma.customerVerification.update({
    where: { id },
    data: { status: "APPROVED", reviewedAt: new Date() },
  });

  await sendTemplate(organization.id, "verification_approved", verification.contact.email, {
    customerName: verification.contact.name || verification.contact.email,
  }).catch((err) => console.error("Verification approval email failed", err));

  revalidatePath("/verification");
}

export async function rejectVerification(id: string) {
  const { organization } = await requireOrg();

  const verification = await prisma.customerVerification.findFirst({
    where: { id, organizationId: organization.id },
    include: { contact: true },
  });
  if (!verification) throw new Error("Not found");
  if (verification.status !== "PENDING") throw new Error("Already reviewed");

  await prisma.customerVerification.update({
    where: { id },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });

  await sendTemplate(organization.id, "verification_rejected", verification.contact.email, {
    customerName: verification.contact.name || verification.contact.email,
  }).catch((err) => console.error("Verification rejection email failed", err));

  revalidatePath("/verification");
}
