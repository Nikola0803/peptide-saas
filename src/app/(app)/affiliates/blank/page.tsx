import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { createBlankAffiliateQr } from "../actions";

export default function BlankAffiliateQrPage() {
  return (
    <div>
      <PageHeader
        title="Create blank shop QR"
        subtitle="Print it now, assign its owner later without changing the QR"
        actions={<Link href="/affiliates" className="rounded-md border border-background-300 px-3 py-1.5 text-sm text-foreground-700 hover:bg-background-100">Cancel</Link>}
      />
      <Card className="max-w-xl p-5">
        <div className="mb-5 rounded-md border border-primary-200 bg-primary-50 p-3 text-xs leading-relaxed text-primary-900">
          This creates an active, unassigned referral URL immediately. Scans and orders are recorded against the QR even before a shop or owner is attached.
        </div>
        <form action={createBlankAffiliateQr} className="space-y-4">
          <label className="block text-xs font-medium text-foreground-600">Internal placement label <span className="font-normal text-foreground-400">(optional)</span>
            <input name="label" placeholder="Downtown counter card 01" className="mt-1 w-full rounded border border-background-300 bg-background-50 px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs font-medium text-foreground-600">Customer discount (%)
            <input name="customerDiscountPercent" type="number" min="0" max="30" step="1" defaultValue="10" required className="mt-1 w-full rounded border border-background-300 bg-background-50 px-3 py-2 text-sm" />
            <span className="mt-1 block text-[11px] font-normal text-foreground-500">Applied when a customer visits or checks out using this QR referral code.</span>
          </label>
          <label className="block text-xs font-medium text-foreground-600">Total assigned rate (%)
            <input name="ratePercent" type="number" min="0" max="40" step="0.1" defaultValue="15" required className="mt-1 w-full rounded border border-background-300 bg-background-50 px-3 py-2 text-sm" />
            <span className="mt-1 block text-[11px] font-normal text-foreground-500">Customer discount plus the future owner&apos;s commission. Example: 15% total − 10% discount = 5% commission.</span>
          </label>
          <button className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-background-50 hover:bg-primary-600">Generate permanent blank QR</button>
        </form>
      </Card>
    </div>
  );
}
