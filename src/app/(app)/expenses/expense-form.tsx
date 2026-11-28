import type { Expense } from "@prisma/client";
import { EXPENSE_CATEGORIES, RECURRENCE_OPTIONS, dayString } from "@/lib/expenses";

const input = "w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50";
const labelCls = "block text-xs font-medium text-foreground-600 mb-1";

export function ExpenseForm({
  action,
  brands,
  defaults,
  defaultBrandId,
  defaultCurrency,
  allowShared,
  returnTo,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  brands: { id: string; name: string }[];
  defaults?: Expense | null;
  defaultBrandId: string | null;
  defaultCurrency: "USD" | "AUD";
  allowShared: boolean;
  returnTo: string;
  submitLabel: string;
}) {
  const brandValue = defaults ? (defaults.brandId ?? "shared") : (defaultBrandId ?? (allowShared ? "shared" : brands[0]?.id));
  return (
    <form action={action} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="lg:col-span-1">
        <label className={labelCls}>Date</label>
        <input
          name="incurredOn"
          type="date"
          required
          defaultValue={dayString(defaults?.incurredOn ?? new Date())}
          className={input}
        />
      </div>
      <div className="lg:col-span-1">
        <label className={labelCls}>Amount</label>
        <div className="flex gap-1">
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            defaultValue={defaults ? (defaults.amountCents / 100).toFixed(2) : undefined}
            className={input}
          />
          <select name="currency" defaultValue={defaults?.currency ?? defaultCurrency} className="text-sm border border-background-300 rounded px-1.5 bg-background-50">
            <option value="USD">USD</option>
            <option value="AUD">AUD</option>
          </select>
        </div>
      </div>
      <div className="lg:col-span-2">
        <label className={labelCls}>Category</label>
        <select name="category" required defaultValue={defaults?.category ?? "ADS"} className={input}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="lg:col-span-2">
        <label className={labelCls}>Store</label>
        <select name="brandId" defaultValue={brandValue} className={input}>
          {allowShared && <option value="shared">Shared (whole business)</option>}
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <label className={labelCls}>Description</label>
        <input
          name="description"
          required
          maxLength={200}
          placeholder="e.g. Meta ads, week 48"
          defaultValue={defaults?.description}
          className={input}
        />
      </div>
      <div className="lg:col-span-3">
        <label className={labelCls}>Paid to (optional)</label>
        <input name="vendor" maxLength={120} placeholder="e.g. Meta, Hostinger, USPS" defaultValue={defaults?.vendor ?? ""} className={input} />
      </div>
      <div className="lg:col-span-2">
        <label className={labelCls}>Repeats</label>
        <select name="recurrence" defaultValue={defaults?.recurrence ?? "NONE"} className={input}>
          {RECURRENCE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="lg:col-span-1">
        <label className={labelCls}>Repeat until (optional)</label>
        <input
          name="recurringUntil"
          type="date"
          defaultValue={defaults?.recurringUntil ? dayString(defaults.recurringUntil) : ""}
          className={input}
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <label className={labelCls}>Notes (optional)</label>
        <input name="notes" maxLength={2000} defaultValue={defaults?.notes ?? ""} className={input} />
      </div>
      <div className="sm:col-span-2 lg:col-span-6 flex flex-wrap items-center gap-3">
        <button className="text-sm bg-primary-500 text-background-50 rounded-md px-4 py-1.5 font-medium hover:bg-primary-600">
          {submitLabel}
        </button>
        <p className="text-xs text-foreground-500">
          Product cost, card fees and affiliate commission are already in order profit, so do not log them here.
          Stock bought from the supplier goes under Inventory purchases (kept out of net by default).
        </p>
      </div>
    </form>
  );
}
