"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendTemplate } from "@/lib/email";

export async function approveMembership(requestId: string) {
  const { organization } = await requireOrg();

  const request = await prisma.membershipRequest.findFirst({
    where: { id: requestId, organizationId: organization.id },
    include: { contact: true },
  });
  if (!request) throw new Error("Not found");
  if (request.status !== "PENDING") throw new Error("Already reviewed");

  await prisma.membershipRequest.update({
    where: { id: requestId },
    data: { status: "APPROVED", reviewedAt: new Date() },
  });

  await sendTemplate(organization.id, "membership_approved", request.contact.email, {
    customerName: request.contact.name || request.contact.email,
  }).catch((err) => console.error("Membership approval email failed", err));

  revalidatePath("/membership");
}

export async function rejectMembership(requestId: string) {
  const { organization } = await requireOrg();

  const request = await prisma.membershipRequest.findFirst({
    where: { id: requestId, organizationId: organization.id },
    include: { contact: true },
  });
  if (!request) throw new Error("Not found");
  if (request.status !== "PENDING") throw new Error("Already reviewed");

  await prisma.membershipRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });

  await sendTemplate(organization.id, "membership_rejected", request.contact.email, {
    customerName: request.contact.name || request.contact.email,
  }).catch((err) => console.error("Membership rejection email failed", err));

  revalidatePath("/membership");
}
