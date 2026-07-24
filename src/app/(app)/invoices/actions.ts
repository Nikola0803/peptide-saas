"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

async function nextInvoiceNumber(organizationId: string): Promise<string> {
  const count = await prisma.invoice.count({ where: { organizationId } });
  return `INV-${String(count + 1).padStart(6, "0")}`;
}

/**
 * Creates an invoice either from scratch (ad-hoc wholesale quote) or
 * pre-filled from an existing Order (formData carries orderId when the
 * "Create invoice" button was clicked from an order's detail page).
 */
export async function createInvoice(formData: FormData) {
  const { organization } = await requireOrg();

  const orderId = String(formData.get("orderId") ?? "").trim() || null;
  const brandId = String(formData.get("brandId") ?? "").trim() || null;
  const customerName = String(formData.get("customerName") ?? "").trim();
  const customerEmail = String(formData.get("customerEmail") ?? "").trim() || null;
  const customerAddress = String(formData.get("customerAddress") ?? "").trim() || null;
  const poNumber = String(formData.get("poNumber") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const taxCents = Math.round(Number(formData.get("tax") ?? 0) * 100);

  if (!customerName) throw new Error("Customer name is required");

  const descriptions = formData.getAll("lineDescription") as string[];
  const quantities = formData.getAll("lineQuantity") as string[];
  const prices = formData.getAll("linePrice") as string[];

  const lines = descriptions
    .map((description, i) => {
      const quantity = Number(quantities[i] ?? 1);
      const unitPriceCents = Math.round(Number(prices[i] ?? 0) * 100);
      return { description: description.trim(), quantity, unitPriceCents, totalCents: quantity * unitPriceCents };
    })
    .filter((l) => l.description);

  if (lines.length === 0) throw new Error("At least one line item is required");

  const subtotalCents = lines.reduce((s, l) => s + l.totalCents, 0);

  const invoice = await prisma.invoice.create({
    data: {
      organizationId: organization.id,
      orderId,
      brandId,
      invoiceNumber: await nextInvoiceNumber(organization.id),
      customerName,
      customerEmail,
      customerAddress,
      poNumber,
      notes,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      lineItems: { create: lines },
    },
  });

  revalidatePath("/invoices");
  redirect(`/invoices/${invoice.id}`);
}

export async function markInvoiceStatus(
  invoiceId: string,
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "VOID"
) {
  const { organization } = await requireOrg();

  await prisma.invoice.update({
    where: { id: invoiceId, organizationId: organization.id },
    data: { status, paidAt: status === "PAID" ? new Date() : undefined },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function deleteInvoice(invoiceId: string) {
  const { organization } = await requireOrg();
  await prisma.invoice.delete({ where: { id: invoiceId, organizationId: organization.id } });
  revalidatePath("/invoices");
  redirect("/invoices");
}
