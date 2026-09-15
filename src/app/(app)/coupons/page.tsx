import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, Card, Badge, EmptyState } from "@/components/ui";
import { money } from "@/lib/format";
import { toggleCouponActive, deleteCoupon, saveMinMarginPercent } from "./actions";

function describeCoupon(c: {
  type: string;
  fixedAmountCents: number | null;
  percentOff: number | null;
  bogoBuyQuantity: number | null;
  bogoGetQuantity: number | null;
  bogoRewardType: string | null;
  bogoRewardPercent: number | null;
  bogoRewardFixedCents: number | null;
  bogoTriggerProduct: { chemicalName: string } | null;
  bogoRewardProduct: { chemicalName: string } | null;
}): string {
  if (c.type === "FIXED") return `${money(c.fixedAmountCents ?? 0)} off`;
  if (c.type === "PERCENT") return `${c.percentOff ?? 0}% off`;

  const buy = c.bogoBuyQuantity ?? 0;
  const get = c.bogoGetQuantity ?? 0;
  const trigger = c.bogoTriggerProduct?.chemicalName ?? "any product";
  const reward = c.bogoRewardProduct?.chemicalName ?? c.bogoTriggerProduct?.chemicalName ?? "same item";
  const rewardDesc =
    c.bogoRewardType === "FREE"
      ? "free"
      : c.bogoRewardType === "PERCENT_OFF"
        ? `${c.bogoRewardPercent ?? 0}% off`
        : `${money(c.bogoRewardFixedCents ?? 0)} off`;
  return `Buy ${buy} ${trigger}, get ${get} ${reward} ${rewardDesc}`;
}

export default async function CouponsPage() {
  const { organization } = await requireOrg();

  const [coupons, org] = await Promise.all([
    prisma.coupon.findMany({
      where: { organizationId: organization.id },
      include: { bogoTriggerProduct: true, bogoRewardProduct: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.organization.findUnique({ where: { id: organization.id }, select: { minMarginPercent: true } }),
  ]);

  const activeCount = coupons.filter((c) => c.active).length;
  const totalRedemptions = coupons.reduce((s, c) => s + c.redemptionCount, 0);

  return (
    <div>
      <PageHeader
        title="Coupons"
        subtitle="Fixed, percent, and BOGO discounts -- applied and floor-guarded automatically at checkout"
        actions={
          <Link href="/coupons/new" className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
            New coupon
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Active coupons" value={String(activeCount)} hint={`${coupons.length} total`} />
        <StatCard label="Total redemptions" value={String(totalRedemptions)} hint="Across all coupons, all time" />
        <StatCard label="Minimum margin floor" value={`${org?.minMarginPercent ?? 30}%`} hint="Over cost -- no coupon can ever go below this" />
      </div>

      <Card className="p-4 mb-6 max-w-md">
        <h2 className="text-sm font-semibold text-foreground-950 mb-1">Wholesale-price floor</h2>
        <p className="text-xs text-foreground-500 mb-3">
          No coupon, alone or stacked, can ever discount an order below cost + this margin. Applies storewide, to every coupon.
        </p>
        <form action={saveMinMarginPercent} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-foreground-600 mb-1">Minimum margin (%)</label>
            <input
              name="minMarginPercent"
              type="number"
              min="0"
              max="95"
              step="1"
              defaultValue={org?.minMarginPercent ?? 30}
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
          </div>
          <button className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-800 hover:bg-background-100">
            Save
          </button>
        </form>
      </Card>

      {coupons.length === 0 ? (
        <EmptyState
          icon="ri-price-tag-3-line"
          title="No coupons yet"
          body="Create a fixed, percent, or BOGO coupon -- the storefront and checkout will accept and apply it automatically."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {coupons.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground-950 font-mono truncate">{c.code}</div>
                  {c.description && <div className="text-xs text-foreground-500 truncate">{c.description}</div>}
                </div>
                <Badge status={c.active ? "active" : "closed"} />
              </div>

              <p className="text-sm text-foreground-800 mb-3">{describeCoupon(c)}</p>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {c.allowStacking ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-secondary-100 text-secondary-700">Stackable</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-background-200 text-foreground-600">No stacking</span>
                )}
                {c.minOrderCents != null && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-background-200 text-foreground-600">
                    Min {money(c.minOrderCents)}
                  </span>
                )}
                {c.maxRedemptions != null && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-background-200 text-foreground-600">
                    {c.redemptionCount}/{c.maxRedemptions} used
                  </span>
                )}
                {c.expiresAt && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-background-200 text-foreground-600">
                    Expires {new Date(c.expiresAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-background-200">
                <form action={toggleCouponActive.bind(null, c.id)}>
                  <button className="text-xs border border-background-300 rounded-md px-2.5 py-1.5 text-foreground-700 hover:bg-background-100">
                    {c.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
                <form action={deleteCoupon.bind(null, c.id)}>
                  <button className="text-xs border border-background-300 rounded-md px-2.5 py-1.5 text-accent-700 hover:bg-accent-50">
                    Delete
                  </button>
                </form>
                {c.redemptionCount === 0 && (
                  <span className="text-[10px] text-foreground-400 ml-auto">Never redeemed</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
