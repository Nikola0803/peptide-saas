import type { ExpenseCategory, ExpenseRecurrence } from "@prisma/client";
import { AUD_PER_USD, type StoreCurrency } from "@/lib/store-currency";

// Shared rules for the Expenses page: categories, periods, recurring
// charges and currency. Dates are calendar days in UTC.

export const EXPENSE_CATEGORIES: {
  value: ExpenseCategory;
  label: string;
  hint: string;
}[] = [
  { value: "ADS", label: "Ads & marketing", hint: "Meta/Google ads, influencers, Smartlead, promo materials" },
  { value: "SHIPPING", label: "Shipping & packaging", hint: "Labels, postage, boxes, mailers" },
  { value: "SOFTWARE", label: "Software & hosting", hint: "VPS, domains, Omnisend, ShipStation, apps" },
  {
    value: "INVENTORY",
    label: "Inventory purchases",
    hint: "Stock bought from the supplier. Not taken off net profit by default: product cost is already in every order's profit.",
  },
  {
    value: "PAYMENT_FEES",
    label: "Payment fees (extra)",
    hint: "Only fees NOT already in order profit: monthly gateway fees, chargebacks, P2P account fees. Card fees per order are already counted.",
  },
  { value: "PAYROLL", label: "Staff & contractors", hint: "Wages, freelancers, VA" },
  { value: "OTHER", label: "Other", hint: "Anything else: rent, legal, bank charges, supplies" },
];

export const CATEGORY_LABEL = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label])) as Record<
  ExpenseCategory,
  string
>;

export const RECURRENCE_OPTIONS: { value: ExpenseRecurrence; label: string }[] = [
  { value: "NONE", label: "One-off" },
  { value: "WEEKLY", label: "Every week" },
  { value: "MONTHLY", label: "Every month" },
  { value: "YEARLY", label: "Every year" },
];

export const RECURRENCE_SHORT: Record<ExpenseRecurrence, string> = {
  NONE: "",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

const DAY = 24 * 60 * 60 * 1000;

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// "2026-11-28" -> Date at 00:00 UTC, or null when blank/invalid.
export function parseDay(raw: string | null | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addMonthsUtc(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  // Clamp: a bill on the 31st lands on the last day of shorter months.
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)));
}

export type PeriodKey = "today" | "7d" | "30d" | "month" | "lastmonth" | "year" | "all" | "custom";

export const PERIODS: { key: Exclude<PeriodKey, "custom">; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

export type Period = { key: PeriodKey; label: string; start: Date | null; end: Date }; // end exclusive

export function resolvePeriod(
  params: { period?: string; from?: string; to?: string },
  now = new Date()
): Period {
  const today = startOfUtcDay(now);
  const tomorrow = new Date(today.getTime() + DAY);
  const from = parseDay(params.from);
  const to = parseDay(params.to);
  if (params.period === "custom" || (!params.period && (from || to))) {
    const end = to ? new Date(to.getTime() + DAY) : tomorrow;
    const label = `${from ? dayString(from) : "start"} to ${to ? dayString(to) : "today"}`;
    return { key: "custom", label, start: from, end };
  }
  switch (params.period) {
    case "today":
      return { key: "today", label: "Today", start: today, end: tomorrow };
    case "7d":
      return { key: "7d", label: "Last 7 days", start: new Date(tomorrow.getTime() - 7 * DAY), end: tomorrow };
    case "30d":
      return { key: "30d", label: "Last 30 days", start: new Date(tomorrow.getTime() - 30 * DAY), end: tomorrow };
    case "lastmonth": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { key: "lastmonth", label: "Last month", start, end };
    }
    case "year":
      return { key: "year", label: "This year", start: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)), end: tomorrow };
    case "all":
      return { key: "all", label: "All time", start: null, end: tomorrow };
    case "month":
    default:
      return {
        key: "month",
        label: "This month",
        start: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
        end: tomorrow,
      };
  }
}

type RecurringFields = {
  incurredOn: Date;
  recurrence: ExpenseRecurrence;
  recurringUntil: Date | null;
};

// Charge dates of one expense that fall in [start, end). Repeats never go
// past today: a monthly bill only counts once its day has come.
export function chargeDatesInRange(e: RecurringFields, start: Date | null, end: Date, now = new Date()): Date[] {
  const cap = new Date(Math.min(end.getTime(), startOfUtcDay(now).getTime() + DAY));
  const first = startOfUtcDay(e.incurredOn);
  if (e.recurrence === "NONE") {
    // A one-off dated in the future still counts once its date is inside
    // the period (it is a known, committed cost).
    return (!start || first >= start) && first < end ? [first] : [];
  }
  const until = e.recurringUntil ? new Date(startOfUtcDay(e.recurringUntil).getTime() + DAY) : null;
  const stop = until && until < cap ? until : cap;
  const dates: Date[] = [];
  for (let i = 0; i < 5000; i++) {
    const d =
      e.recurrence === "WEEKLY"
        ? new Date(first.getTime() + i * 7 * DAY)
        : e.recurrence === "MONTHLY"
          ? addMonthsUtc(first, i)
          : addMonthsUtc(first, i * 12);
    if (d >= stop) break;
    if (!start || d >= start) dates.push(d);
  }
  return dates;
}

export function normalizeCurrency(raw: string | null | undefined): StoreCurrency {
  return raw === "AUD" ? "AUD" : "USD";
}

export function convertCents(cents: number, from: StoreCurrency, to: StoreCurrency): number {
  if (from === to) return cents;
  return from === "AUD" ? Math.round(cents / AUD_PER_USD) : Math.round(cents * AUD_PER_USD);
}
