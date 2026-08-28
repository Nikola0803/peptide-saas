import type { PayoutMethod, BankAccountType } from "@prisma/client";

// evlv-site's affiliate portal uses lowercase wire values ("venmo",
// "bank_ach", "checking") while the DB enums are uppercase -- these are
// the two-way mappers every affiliate route needs.
const PAYOUT_METHOD_TO_WIRE: Record<PayoutMethod, string> = {
  VENMO: "venmo",
  ZELLE: "zelle",
  CASHAPP: "cashapp",
  BANK_ACH: "bank_ach",
};
const PAYOUT_METHOD_FROM_WIRE: Record<string, PayoutMethod> = {
  venmo: "VENMO",
  zelle: "ZELLE",
  cashapp: "CASHAPP",
  bank_ach: "BANK_ACH",
};
const BANK_ACCOUNT_TYPE_TO_WIRE: Record<BankAccountType, string> = {
  CHECKING: "checking",
  SAVINGS: "savings",
};
const BANK_ACCOUNT_TYPE_FROM_WIRE: Record<string, BankAccountType> = {
  checking: "CHECKING",
  savings: "SAVINGS",
};

export function payoutMethodToWire(v: PayoutMethod | null): string | null {
  return v ? PAYOUT_METHOD_TO_WIRE[v] : null;
}
export function payoutMethodFromWire(v: string | undefined | null): PayoutMethod | null {
  return v ? PAYOUT_METHOD_FROM_WIRE[v] ?? null : null;
}
export function bankAccountTypeToWire(v: BankAccountType | null): string | null {
  return v ? BANK_ACCOUNT_TYPE_TO_WIRE[v] : null;
}
export function bankAccountTypeFromWire(v: string | undefined | null): BankAccountType | null {
  return v ? BANK_ACCOUNT_TYPE_FROM_WIRE[v] ?? null : null;
}
