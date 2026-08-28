"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// Staff review step per WHOLESALE-PARTNER-PORTAL.md: link an inquiry to a
// Contact (creating one if the prospect never had an account -- a
// wholesale lead doesn't require having shopped first) and approve it in
// one action. No self-serve UI for this on purpose, same tier of manual
// work as approving the inquiry itself.
export async function linkAndApproveInquiry(inquiryId: string) {
  const { organization } = await requireOrg();

  const inquiry = await prisma.wholesaleInquiry.findFirst({ where: { id: inquiryId, organizationId: organization.id } });
  if (!inquiry) throw new Error("Not found");

  const contact = await prisma.contact.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: inquiry.email } },
    update: {},
    create: { organizationId: organization.id, email: inquiry.email, name: inquiry.contactName },
  });

  const existingPartner = await prisma.wholesalePartner.findUnique({ where: { contactId: contact.id } });
  if (existingPartner) {
    await prisma.wholesalePartner.update({
      where: { id: existingPartner.id },
      data: { status: "APPROVED", businessName: existingPartner.businessName ?? inquiry.companyName },
    });
  } else {
    await prisma.wholesalePartner.create({
      data: { contactId: contact.id, status: "APPROVED", businessName: inquiry.companyName, notificationEmail: inquiry.email },
    });
  }

  await prisma.wholesaleInquiry.update({ where: { id: inquiryId }, data: { status: "LINKED" } });

  revalidatePath("/wholesale");
}

export async function rejectInquiry(inquiryId: string) {
  const { organization } = await requireOrg();
  await prisma.wholesaleInquiry.updateMany({
    where: { id: inquiryId, organizationId: organization.id },
    data: { status: "REJECTED" },
  });
  revalidatePath("/wholesale");
}

export async function createWholesaleInvoice(partnerId: string, formData: FormData) {
  const { organization } = await requireOrg();

  const partner = await prisma.wholesalePartner.findFirst({
    where: { id: partnerId, contact: { organizationId: organization.id } },
  });
  if (!partner) throw new Error("Not found");

  const label = String(formData.get("label") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim();
  const paymentMemo = String(formData.get("paymentMemo") ?? "").trim();
  if (!label) throw new Error("A label is required");
  if (!(amount > 0)) throw new Error("Amount must be greater than zero");

  await prisma.wholesaleInvoice.create({
    data: {
      partnerId: partner.id,
      label,
      amountCents: Math.round(amount * 100),
      paymentMethod: paymentMethod || null,
      paymentMemo: paymentMemo || null,
    },
  });

  revalidatePath("/wholesale");
}

export async function markWholesaleInvoicePaid(invoiceId: string) {
  const { organization } = await requireOrg();
  const invoice = await prisma.wholesaleInvoice.findFirst({
    where: { id: invoiceId, partner: { contact: { organizationId: organization.id } } },
  });
  if (!invoice) throw new Error("Not found");
  await prisma.wholesaleInvoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidDate: new Date() } });
  revalidatePath("/wholesale");
}
