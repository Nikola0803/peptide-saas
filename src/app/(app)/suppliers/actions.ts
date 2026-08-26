"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import { importSupplierCsv, type ImportResult } from "@/lib/supplier-import";

export async function createSupplier(formData: FormData) {
  const { organization } = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim().toLowerCase();
  if (!name) throw new Error("Name is required");

  await prisma.supplier.create({
    data: { organizationId: organization.id, name, contactEmail: contactEmail || null },
  });

  revalidatePath("/suppliers");
}

export async function setSupplierActive(supplierId: string, active: boolean) {
  const { organization } = await requireOrg();
  await prisma.supplier.updateMany({ where: { id: supplierId, organizationId: organization.id }, data: { active } });
  revalidatePath("/suppliers");
}

// Creates (or reuses) the login this supplier's own team uses to reach
// /dropship. Returns the one-time password in plain text -- it's never
// stored anywhere except this response and the bcrypt hash, so this is the
// only chance to hand it to the supplier; there's no "forgot password"
// flow yet, re-run this to reset it.
export async function inviteSupplierLogin(supplierId: string, formData: FormData): Promise<{ email: string; password: string }> {
  const { organization } = await requireOrg();

  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organizationId: organization.id } });
  if (!supplier) throw new Error("Supplier not found");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) throw new Error("Email is required");

  const password = createId().slice(0, 16);
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, name: supplier.name },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
    update: { role: "DROPSHIP_AGENT", supplierId },
    create: { userId: user.id, organizationId: organization.id, role: "DROPSHIP_AGENT", supplierId },
  });

  revalidatePath("/suppliers");
  return { email, password };
}

// Staff pre-filling a supplier's price list on their behalf -- same
// importer a supplier uses themselves from /dropship/products, so once
// they get invited a login their catalog is already there instead of
// starting empty. If the CSV came from an Excel export, save it as CSV
// first (File → Save As → CSV) -- xlsx isn't parsed server-side here.
export async function importSupplierPriceList(supplierId: string, formData: FormData): Promise<ImportResult> {
  const { organization } = await requireOrg();

  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organizationId: organization.id } });
  if (!supplier) throw new Error("Supplier not found");

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("Choose a CSV file first");

  const result = await importSupplierCsv(organization.id, supplierId, await file.text());
  revalidatePath(`/suppliers/${supplierId}`);
  return result;
}

export async function setInvoiceStatus(invoiceId: string, status: "SENT" | "PAID") {
  const { organization } = await requireOrg();
  await prisma.supplierInvoice.updateMany({
    where: { id: invoiceId, supplier: { organizationId: organization.id } },
    data: { status },
  });
  revalidatePath("/suppliers");
}
