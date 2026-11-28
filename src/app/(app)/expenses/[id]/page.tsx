import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { money, dateTime } from "@/lib/format";
import { CATEGORY_LABEL, RECURRENCE_SHORT, normalizeCurrency, startOfUtcDay } from "@/lib/expenses";
import { brandCurrency } from "@/lib/store-currency";
import { deleteExpense, stopRecurringExpense, updateExpense } from "../actions";
import { ExpenseForm } from "../expense-form";

export default async function EditExpensePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { returnTo?: string };
}) {
  const { organization, allowedBrandIds } = await requireAdmin();
  const expense = await prisma.expense.findFirst({ where: { id: params.id, organizationId: organization.id } });
  if (!expense) notFound();
  if (allowedBrandIds && (!expense.brandId || !allowedBrandIds.includes(expense.brandId))) notFound();

  const allBrands = await prisma.brand.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, domain: true },
  });
  const brands = allowedBrandIds ? allBrands.filter((b) => allowedBrandIds.includes(b.id)) : allBrands;
  const returnTo = searchParams.returnTo?.startsWith("/expenses") ? searchParams.returnTo : "/expenses";
  const brand = allBrands.find((b) => b.id === expense.brandId);
  const stillRunning =
    expense.recurrence !== "NONE" && (!expense.recurringUntil || expense.recurringUntil >= startOfUtcDay(new Date()));

  return (
    <div>
      <PageHeader
        title="Edit expense"
        subtitle={`${CATEGORY_LABEL[expense.category]} · ${money(expense.amountCents, normalizeCurrency(expense.currency))}${
          expense.recurrence !== "NONE" ? ` ${RECURRENCE_SHORT[expense.recurrence].toLowerCase()}` : ""
        } · ${brand?.name ?? "Shared"}`}
        actions={
          <Link href={returnTo} className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
            Back
          </Link>
        }
      />
      <Card className="p-4 mb-4">
        <ExpenseForm
          action={updateExpense.bind(null, expense.id)}
          brands={brands}
          defaults={expense}
          defaultBrandId={expense.brandId}
          defaultCurrency={brand ? brandCurrency(brand) : "USD"}
          allowShared={!allowedBrandIds}
          returnTo={returnTo}
          submitLabel="Save changes"
        />
      </Card>
      <div className="flex flex-wrap items-start gap-2">
        {stillRunning && (
          <form action={stopRecurringExpense.bind(null, expense.id)}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <button className="text-xs border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
              Stop repeating from today
            </button>
          </form>
        )}
        <details className="text-xs">
          <summary className="cursor-pointer inline-block border border-background-300 rounded-md px-3 py-1.5 text-accent-700 hover:bg-accent-50">
            Delete
          </summary>
          <form action={deleteExpense.bind(null, expense.id)} className="mt-2 flex items-center gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <span className="text-foreground-600">
              {expense.recurrence !== "NONE" ? "This removes every past charge of this bill too. " : ""}Delete for good?
            </span>
            <button className="border border-accent-300 bg-accent-50 rounded-md px-3 py-1.5 text-accent-700 font-medium">Yes, delete</button>
          </form>
        </details>
        <span className="text-[11px] text-foreground-400 ml-auto">
          Added {dateTime(expense.createdAt)}
          {expense.createdByEmail ? ` by ${expense.createdByEmail}` : ""}
        </span>
      </div>
    </div>
  );
}
