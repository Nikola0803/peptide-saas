import Link from "next/link";
import type { ExpenseCategory } from "@prisma/client";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/active-brand";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { money, shortDate } from "@/lib/format";
import { brandCurrency, AUD_PER_USD } from "@/lib/store-currency";
import {
  CATEGORY_LABEL,
  EXPENSE_CATEGORIES,
  PERIODS,
  RECURRENCE_SHORT,
  addMonthsUtc,
  chargeDatesInRange,
  convertCents,
  dayString,
  normalizeCurrency,
  resolvePeriod,
  startOfUtcDay,
} from "@/lib/expenses";
import { addOrder, emptyOrderTotals, loadPaidOrders } from "@/lib/profit-summary";
import { createExpense } from "./actions";
import { ExpenseForm } from "./expense-form";

type SearchParams = { period?: string; from?: string; to?: string; category?: string; inventory?: string };

function qs(base: SearchParams, patch: Partial<SearchParams>): string {
  const merged = { ...base, ...patch };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/expenses?${s}` : "/expenses";
}

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  const { organization, allowedBrandIds } = await requireAdmin();
  const activeBrand = await getActiveBrand(organization.id);
  const now = new Date();
  const period = resolvePeriod(searchParams, now);
  const includeInventory = searchParams.inventory === "1";
  const categoryFilter = EXPENSE_CATEGORIES.some((c) => c.value === searchParams.category)
    ? (searchParams.category as ExpenseCategory)
    : null;

  const allBrands = await prisma.brand.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, domain: true },
  });
  const brands = allowedBrandIds ? allBrands.filter((b) => allowedBrandIds.includes(b.id)) : allBrands;
  const scopedBrand = activeBrand && brands.some((b) => b.id === activeBrand.id) ? activeBrand : null;
  const currencyByBrand = new Map(allBrands.map((b) => [b.id, brandCurrency(b)]));
  const display = scopedBrand ? (currencyByBrand.get(scopedBrand.id) ?? "USD") : "USD";
  const orderBrandIds = scopedBrand ? [scopedBrand.id] : allowedBrandIds;
  const canSeeShared = !allowedBrandIds;

  // Order side: the chosen period plus the last 12 months for the trend table.
  const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const loadStart = period.start && period.start > trendStart ? trendStart : period.start;
  const [orders, expenses] = await Promise.all([
    loadPaidOrders({ organizationId: organization.id, brandIds: orderBrandIds, start: loadStart, end: new Date(Math.max(period.end.getTime(), startOfUtcDay(now).getTime() + 86400000)) }),
    prisma.expense.findMany({
      where: {
        organizationId: organization.id,
        ...(scopedBrand
          ? { OR: [{ brandId: scopedBrand.id }, ...(canSeeShared ? [{ brandId: null }] : [])] }
          : allowedBrandIds
            ? { brandId: { in: allowedBrandIds } }
            : {}),
      },
      include: { brand: { select: { name: true } } },
      orderBy: { incurredOn: "desc" },
    }),
  ]);

  const inPeriod = (d: Date) => (!period.start || d >= period.start) && d < period.end;
  const totals = emptyOrderTotals();
  for (const o of orders) {
    if (inPeriod(o.placedAt)) addOrder(totals, o, currencyByBrand.get(o.brandId) ?? "USD", display);
  }

  // In a single-store view, shared expenses are shown but not subtracted:
  // they belong to the whole business (see the All stores view).
  const counts = (e: (typeof expenses)[number]) => !scopedBrand || e.brandId === scopedBrand.id;
  const conv = (e: (typeof expenses)[number]) => convertCents(e.amountCents, normalizeCurrency(e.currency), display);

  const byCategory = new Map<ExpenseCategory, number>();
  let sharedTotal = 0;
  const rows: { e: (typeof expenses)[number]; times: number; total: number; last: Date }[] = [];
  for (const e of expenses) {
    const dates = chargeDatesInRange(e, period.start, period.end, now);
    if (dates.length === 0) continue;
    const total = dates.length * conv(e);
    if (counts(e)) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + total);
    else sharedTotal += total;
    if (!categoryFilter || e.category === categoryFilter) {
      rows.push({ e, times: dates.length, total, last: dates[dates.length - 1] });
    }
  }
  rows.sort((a, b) => b.last.getTime() - a.last.getTime());

  const operating = [...byCategory.entries()]
    .filter(([c]) => c !== "INVENTORY")
    .reduce((s, [, v]) => s + v, 0);
  const inventory = byCategory.get("INVENTORY") ?? 0;
  const expensesCounted = operating + (includeInventory ? inventory : 0);
  const net = totals.profit + totals.shippingCharged - expensesCounted;
  const margin = totals.revenue > 0 ? (net / totals.revenue) * 100 : null;

  // 12-month trend.
  const months: { start: Date; end: Date }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ start, end: addMonthsUtc(start, 1) });
  }
  const trend = months.map(({ start, end }) => {
    const t = emptyOrderTotals();
    for (const o of orders) if (o.placedAt >= start && o.placedAt < end) addOrder(t, o, currencyByBrand.get(o.brandId) ?? "USD", display);
    let ex = 0;
    for (const e of expenses) {
      if (!counts(e) || (e.category === "INVENTORY" && !includeInventory)) continue;
      ex += chargeDatesInRange(e, start, end, now).length * conv(e);
    }
    return { start, revenue: t.revenue, profit: t.profit + t.shippingCharged, expenses: ex, net: t.profit + t.shippingCharged - ex };
  });
  // Skip the empty months before the business had any orders or costs.
  const firstActive = trend.findIndex((row) => row.revenue || row.expenses);
  const trendRows = firstActive < 0 ? [] : trend.slice(firstActive);
  const trendHasData = trendRows.length > 0;

  // Recurring bills still running, as a monthly run-rate.
  const running = expenses.filter(
    (e) => counts(e) && e.recurrence !== "NONE" && (!e.recurringUntil || e.recurringUntil >= startOfUtcDay(now))
  );
  const monthlyRunRate = running.reduce((s, e) => {
    const c = conv(e);
    return s + (e.recurrence === "WEEKLY" ? (c * 52) / 12 : e.recurrence === "YEARLY" ? c / 12 : c);
  }, 0);

  const m = (c: number) => money(Math.round(c), display);
  // Amount taken off: "-$12.00", or "$0.00" when nothing.
  const neg = (c: number) => (Math.round(c) === 0 ? m(0) : `-${m(c)}`);
  const subtitle = `${scopedBrand ? scopedBrand.name : "All stores"} · ${period.label} · ${display}${
    !scopedBrand && [...currencyByBrand.values()].includes("AUD") ? ` (AUD converted at ${AUD_PER_USD} per USD)` : ""
  }`;
  const returnTo = qs(searchParams, {});

  return (
    <div>
      <PageHeader title="Expenses" subtitle={subtitle} />

      {/* Period picker */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={qs(searchParams, { period: p.key, from: undefined, to: undefined })}
            className={`text-xs rounded-md px-2.5 py-1.5 border ${
              period.key === p.key
                ? "bg-primary-500 border-primary-500 text-background-50"
                : "border-background-300 text-foreground-700 hover:bg-background-100"
            }`}
          >
            {p.label}
          </Link>
        ))}
        <form action="/expenses" className="flex items-center gap-1 text-xs">
          <input type="hidden" name="period" value="custom" />
          {includeInventory && <input type="hidden" name="inventory" value="1" />}
          <input type="date" name="from" defaultValue={searchParams.from} className="border border-background-300 rounded px-1.5 py-1 bg-background-50" />
          <span className="text-foreground-500">to</span>
          <input type="date" name="to" defaultValue={searchParams.to} className="border border-background-300 rounded px-1.5 py-1 bg-background-50" />
          <button className="border border-background-300 rounded-md px-2 py-1 text-foreground-700 hover:bg-background-100">Go</button>
        </form>
      </div>

      {/* Bottom line */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Tile label="Revenue" value={m(totals.revenue)} hint={`${totals.orders} paid order${totals.orders === 1 ? "" : "s"}, products only`} />
        <Tile label="Order profit" value={m(totals.profit + totals.shippingCharged)} hint="After product cost, card fees, commission; plus shipping paid" />
        <Tile label="Expenses" value={neg(expensesCounted)} hint={includeInventory ? "Including inventory purchases" : "Excluding inventory purchases"} />
        <Tile
          label="True net profit"
          value={m(net)}
          hint={margin == null ? "No revenue in this period" : `${margin.toFixed(1)}% of revenue`}
          tone={net < 0 ? "bad" : "good"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Breakdown */}
        <Card className="p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">How the net adds up</h2>
          <table className="w-full text-sm tabular-nums">
            <tbody>
              <Line label="Products revenue" value={m(totals.revenue)} />
              <Line label="Product cost (COGS)" value={neg(totals.cogs)} muted />
              <Line label="Card fees" value={neg(totals.fees)} muted />
              <Line label="Affiliate commission" value={neg(totals.commission)} muted />
              <Line label="Shipping paid by customers" value={`+${m(totals.shippingCharged)}`} muted />
              <Line label="Order profit" value={m(totals.profit + totals.shippingCharged)} strong />
              {EXPENSE_CATEGORIES.filter((c) => c.value !== "INVENTORY").map((c) => (
                <Line key={c.value} label={c.label} value={neg(byCategory.get(c.value) ?? 0)} muted={!byCategory.get(c.value)} />
              ))}
              <tr>
                <td className="py-1 text-foreground-600">
                  Inventory purchases{" "}
                  <Link
                    href={qs(searchParams, { inventory: includeInventory ? undefined : "1" })}
                    className="ml-1 text-[11px] text-primary-700 underline"
                  >
                    {includeInventory ? "leave out of net" : "count in net"}
                  </Link>
                </td>
                <td className={`py-1 text-right ${includeInventory ? "" : "text-foreground-400 line-through"}`}>{neg(inventory)}</td>
              </tr>
              <tr className="border-t border-background-200 font-semibold text-foreground-950">
                <td className="pt-2">True net profit</td>
                <td className={`pt-2 text-right ${net < 0 ? "text-accent-700" : ""}`}>{m(net)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-foreground-500 mt-3">
            Inventory purchases are left out by default because product cost is already taken off every order sold.
            Counting both would charge the same stock twice. Turn it on to see cash spent instead of profit earned.
            {scopedBrand && sharedTotal > 0 && (
              <>
                {" "}Shared expenses of {m(sharedTotal)} in this period are listed below but only taken off in the All stores view.
              </>
            )}
          </p>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground-950 mb-1">Recurring bills</h2>
          <p className="text-xs text-foreground-500 mb-3">
            {running.length} running · about {m(monthlyRunRate)} a month
          </p>
          {running.length === 0 ? (
            <p className="text-xs text-foreground-500">Set "Repeats" on an expense (e.g. VPS, Omnisend) and it is added every period automatically.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {running.slice(0, 8).map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <Link href={`/expenses/${e.id}?returnTo=${encodeURIComponent(returnTo)}`} className="truncate text-foreground-800 hover:underline">
                    {e.description}
                  </Link>
                  <span className="tabular-nums text-foreground-600 whitespace-nowrap">
                    {m(conv(e))} {RECURRENCE_SHORT[e.recurrence].toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Add */}
      <Card className="p-4 mb-4">
        <h2 className="text-sm font-semibold text-foreground-950 mb-3">Add expense</h2>
        <ExpenseForm
          action={createExpense}
          brands={brands}
          defaultBrandId={scopedBrand?.id ?? null}
          defaultCurrency={display}
          allowShared={canSeeShared}
          returnTo={returnTo}
          submitLabel="Add expense"
        />
      </Card>

      {/* List */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-foreground-950">Expenses · {period.label}</h2>
          <div className="flex flex-wrap gap-1">
            <FilterChip href={qs(searchParams, { category: undefined })} active={!categoryFilter} label="All" />
            {EXPENSE_CATEGORIES.map((c) => (
              <FilterChip key={c.value} href={qs(searchParams, { category: c.value })} active={categoryFilter === c.value} label={c.label} />
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon="ri-wallet-3-line"
            title="No expenses in this period"
            body="Add ad spend, shipping, software and other costs above. They are taken off order profit to show the true bottom line."
          />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-xs text-foreground-500 text-left">
                  <th className="font-medium pb-2">Date</th>
                  <th className="font-medium pb-2">Description</th>
                  <th className="font-medium pb-2">Category</th>
                  <th className="font-medium pb-2">Store</th>
                  <th className="font-medium pb-2 text-right">In period</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ e, times, total, last }) => (
                  <tr key={e.id} className="border-t border-background-200 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-foreground-600">{shortDate(e.recurrence === "NONE" ? e.incurredOn : last)}</td>
                    <td className="py-2 pr-3">
                      <div className="text-foreground-900">{e.description}</div>
                      <div className="text-xs text-foreground-500">
                        {[e.vendor, e.recurrence !== "NONE" ? `${RECURRENCE_SHORT[e.recurrence]} ${money(e.amountCents, normalizeCurrency(e.currency))}${times > 1 ? `, ${times}x in period` : ""}` : null, e.notes]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded ${
                          e.category === "INVENTORY" ? "bg-background-200 text-foreground-600" : "bg-secondary-100 text-secondary-700"
                        }`}
                      >
                        {CATEGORY_LABEL[e.category]}
                      </span>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-foreground-600">{e.brand?.name ?? "Shared"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                      {m(total)}
                      {normalizeCurrency(e.currency) !== display && (
                        <div className="text-[11px] text-foreground-400">{money(e.amountCents * times, normalizeCurrency(e.currency))}</div>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/expenses/${e.id}?returnTo=${encodeURIComponent(returnTo)}`}
                        className="text-xs border border-background-300 rounded-md px-2 py-1 text-foreground-700 hover:bg-background-100"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Trend */}
      {trendHasData && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">Last 12 months</h2>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm tabular-nums min-w-[480px]">
              <thead>
                <tr className="text-xs text-foreground-500">
                  <th className="text-left font-medium pb-2">Month</th>
                  <th className="text-right font-medium pb-2">Revenue</th>
                  <th className="text-right font-medium pb-2">Order profit</th>
                  <th className="text-right font-medium pb-2">Expenses</th>
                  <th className="text-right font-medium pb-2">True net</th>
                </tr>
              </thead>
              <tbody>
                {trendRows.map((row) => (
                  <tr key={row.start.toISOString()} className="border-t border-background-200">
                    <td className="py-1.5">{row.start.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</td>
                    <td className="py-1.5 text-right">{m(row.revenue)}</td>
                    <td className="py-1.5 text-right">{m(row.profit)}</td>
                    <td className="py-1.5 text-right">{neg(row.expenses)}</td>
                    <td className={`py-1.5 text-right font-medium ${row.net < 0 ? "text-accent-700" : "text-foreground-950"}`}>{m(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="text-[11px] text-foreground-400 mt-3">
        Paid orders = completed + processing, same as the Dashboard. Days are counted in UTC. Generated {dayString(now)}.
      </p>
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === "bad" ? "border-accent-300 bg-accent-50" : tone === "good" ? "border-primary-300 bg-primary-50" : "border-background-200 bg-background-50"
      }`}
    >
      <div className="text-xs text-foreground-500 mb-1">{label}</div>
      <div className={`text-xl sm:text-2xl font-semibold tabular-nums ${tone === "bad" ? "text-accent-700" : "text-foreground-950"}`}>{value}</div>
      {hint && <div className="text-[11px] text-foreground-500 mt-1">{hint}</div>}
    </div>
  );
}

function Line({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <tr className={strong ? "border-t border-background-200 font-semibold text-foreground-950" : ""}>
      <td className={`py-1 ${strong ? "pt-2" : "text-foreground-600"}`}>{label}</td>
      <td className={`py-1 text-right ${strong ? "pt-2" : muted ? "text-foreground-500" : ""}`}>{value}</td>
    </tr>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`text-[11px] rounded px-2 py-0.5 border ${
        active ? "bg-foreground-900 border-foreground-900 text-background-50" : "border-background-300 text-foreground-600 hover:bg-background-100"
      }`}
    >
      {label}
    </Link>
  );
}
