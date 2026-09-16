"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendTemplate } from "@/lib/email";

// Approving anonymizes the Contact rather than deleting the row -- Order
// records reference contactId and need to survive for accounting/tax
// records regardless of what the customer asked for (see the doc comment
// on AccountDeletionRequest in schema.prisma). The confirmation email
// has to go out BEFORE the address is scrubbed, since after this the
// contact's real email no longer exists anywhere in the system.
export async function approveAccountDeletion(requestId: string) {
  const { organization } = await requireOrg();

  const request = await prisma.accountDeletionRequest.findFirst({
    where: { id: requestId, organizationId: organization.id },
    include: { contact: true },
  });
  if (!request) throw new Error("Not found");
  if (request.status !== "PENDING") throw new Error("Already reviewed");

  await sendTemplate(organization.id, "account_deletion_approved", request.contact.email, {
    customerName: request.contact.name || request.contact.email,
  }).catch((err) => console.error("Account deletion approval email failed", err));

  await prisma.$transaction([
    prisma.accountDeletionRequest.update({
      where: { id: requestId },
      data: { status: "APPROVED", reviewedAt: new Date() },
    }),
    prisma.contact.update({
      where: { id: request.contactId },
      data: {
        // Keep the row (and its Orders) but scrub anything personally
        // identifying. Email has to stay unique per org, so it's replaced
        // with an unguessable placeholder rather than cleared.
        email: `deleted-${request.contactId}@removed.evlvpeptides.com`,
        name: null,
        passwordHash: null,
        marketingOptIn: false,
        lastVisitorId: null,
      },
    }),
  ]);

  revalidatePath("/account-deletion");
}

export async function rejectAccountDeletion(requestId: string) {
  const { organization } = await requireOrg();

  const request = await prisma.accountDeletionRequest.findFirst({
    where: { id: requestId, organizationId: organization.id },
    include: { contact: true },
  });
  if (!request) throw new Error("Not found");
  if (request.status !== "PENDING") throw new Error("Already reviewed");

  await prisma.accountDeletionRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });

  await sendTemplate(organization.id, "account_deletion_rejected", request.contact.email, {
    customerName: request.contact.name || request.contact.email,
  }).catch((err) => console.error("Account deletion rejection email failed", err));

  revalidatePath("/account-deletion");
}
