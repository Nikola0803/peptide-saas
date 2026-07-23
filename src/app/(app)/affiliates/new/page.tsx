import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { createAffiliate } from "../actions";

export default function NewAffiliatePage() {
  return (
    <div>
      <PageHeader
        title="New affiliate"
        subtitle="Attribution runs off the coupon code"
        actions={
          <Link href="/affiliates" className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
            Cancel
          </Link>
        }
      />
      <Card className="p-4 max-w-lg">
        <form action={createAffiliate} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground-600 mb-1">Name</label>
            <input
              name="name"
              required
              placeholder="Atlas Fitness Blog"
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-600 mb-1">Coupon code</label>
            <input
              name="couponCode"
              required
              placeholder="ATLAS20"
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50 font-mono uppercase"
            />
            <p className="text-[11px] text-foreground-500 mt-1">
              Orders that use this coupon code get attributed to this affiliate automatically.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-600 mb-1">Commission rate (%)</label>
            <input
              name="ratePercent"
              type="number"
              step="0.1"
              defaultValue="15"
              required
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
          </div>
          <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
            Create affiliate
          </button>
        </form>
      </Card>
    </div>
  );
}
