"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ExpenseCategory, ExpenseRecurrence } from "@prisma/client";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { EXPENSE_CATEGORIES, RECURRENCE_OPTIONS, normalizeCurrency, parseDay, startOfUtcDay } from "@/lib/expenses";

function str(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return raw == null ? "" : String(raw).trim();
}

async function readExpenseForm(formData: FormData, organizationId: string, allowedBrandIds: string[] | null) {
  const amount = Number(str(formData, "amount").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount above 0");
  const amountCents = Math.round(amount * 100);

  const category = str(formData, "category") as ExpenseCategory;
  if (!EXPENSE_CATEGORIES.some((c) => c.value === category)) throw new Error("Pick a category");

  const incurredOn = parseDay(str(formData, "incurredOn"));
  if (!incurredOn) throw new Error("Pick a date");

  const description = str(formData, "description");
  if (!description) throw new Error("Add a short description");

  const recurrence = (str(formData, "recurrence") || "NONE") as ExpenseRecurrence;
  if (!RECURRENCE_OPTIONS.some((r) => r.value === recurrence)) throw new Error("Invalid repeat option");
  const recurringUntil = recurrence === "NONE" ? null : parseDay(str(formData, "recurringUntil"));
  if (recurringUntil && recurringUntil < incurredOn) throw new Error("Repeat end date is before the first charge");

  const brandRaw = str(formData, "brandId");
  let brandId: string | null = null;
  if (brandRaw && brandRaw !== "shared") {
    const brand = await prisma.brand.findFirst({ where: { id: brandRaw, organizationId }, select: { id: true } });
    if (!brand) throw new Error("Unknown store");
    brandId = brand.id;
  }
  if (allowedBrandIds && (!brandId || !allowedBrandIds.includes(brandId))) {
    throw new Error("You can only log expenses for your own stores");
  }

  return {
    category,
    amountCents,
    currency: normalizeCurrency(str(formData, "currency")),
    incurredOn,
    description: description.slice(0, 200),
    vendor: str(formData, "vendor").slice(0, 120) || null,
    notes: str(formData, "notes").slice(0, 2000) || null,
    recurrence,
    recurringUntil,
    brandId,
  };
}

async function findOwnExpense(id: string, organizationId: string, allowedBrandIds: string[] | null) {
  const expense = await prisma.expense.findFirst({ where: { id, organizationId } });
  if (!expense) throw new Error("Expense not found");
  if (allowedBrandIds && (!expense.brandId || !allowedBrandIds.includes(expense.brandId))) {
    throw new Error("Expense not found");
  }
  return expense;
}

function backTo(formData: FormData): string {
  const ret = str(formData, "returnTo");
  return ret.startsWith("/expenses") ? ret : "/expenses";
}

export async function createExpense(formData: FormData) {
  const { organization, session, allowedBrandIds } = await requireAdmin();
  const data = await readExpenseForm(formData, organization.id, allowedBrandIds);
  await prisma.expense.create({
    data: { ...data, organizationId: organization.id, createdByEmail: session.user?.email ?? null },
  });
  revalidatePath("/expenses");
  redirect(backTo(formData));
}

export async function updateExpense(id: string, formData: FormData) {
  const { organization, allowedBrandIds } = await requireAdmin();
  await findOwnExpense(id, organization.id, allowedBrandIds);
  const data = await readExpenseForm(formData, organization.id, allowedBrandIds);
  await prisma.expense.update({ where: { id }, data });
  revalidatePath("/expenses");
  redirect(backTo(formData));
}

export async function deleteExpense(id: string, formData: FormData) {
  const { organization, allowedBrandIds } = await requireAdmin();
  await findOwnExpense(id, organization.id, allowedBrandIds);
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/expenses");
  redirect(backTo(formData));
}

// Ends a recurring expense today: past charges stay counted, no new ones.
export async function stopRecurringExpense(id: string, formData: FormData) {
  const { organization, allowedBrandIds } = await requireAdmin();
  const expense = await findOwnExpense(id, organization.id, allowedBrandIds);
  if (expense.recurrence !== "NONE") {
    const today = startOfUtcDay(new Date());
    await prisma.expense.update({
      where: { id },
      data: { recurringUntil: today < expense.incurredOn ? expense.incurredOn : today },
    });
  }
  revalidatePath("/expenses");
  redirect(backTo(formData));
}
