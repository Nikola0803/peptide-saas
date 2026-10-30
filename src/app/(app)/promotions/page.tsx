import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { money } from "@/lib/format";
import { setDealOfTheDay, clearDealOfTheDay, saveGiveawayConfig, saveCampaignPromotion } from "./actions";
import { utcDateString } from "@/lib/order-engine";

export default async function PromotionsPage() {
  const { organization } = await requireOrg();
  const today = utcDateString();

  const brands = await prisma.brand.findMany({
    where: { organizationId: organization.id },
    include: {
      giveawayConfig: true,
      products: {
        where: { active: true },
        include: { product: true },
        orderBy: { slug: "asc" },
      },
    },
    orderBy: { name: "asc" },
    // campaign fields are scalar columns on Brand — auto-included
  });

  if (brands.length === 0) {
    return (
      <div>
        <PageHeader title="Promotions" subtitle="Deal of the Day and the giveaway shown on your storefront" />
        <EmptyState icon="ri-price-tag-3-line" title="No brands yet" body="Add a brand before setting up promotions." />
      </div>
    );
  }

  const entryCounts = await prisma.giveawayEntry.groupBy({
    by: ["brandId"],
    where: { brandId: { in: brands.map((b) => b.id) }, entryDate: today },
    _count: true,
  });
  const entriesFor = (brandId: string) => entryCounts.find((e) => e.brandId === brandId)?._count ?? 0;

  const todaysEntrants = await prisma.giveawayEntry.findMany({
    where: { brandId: { in: brands.map((b) => b.id) }, entryDate: today },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Promotions"
        subtitle="Deal of the Day and the giveaway shown on your storefront -- both change what checkout actually charges/tracks, not just display copy"
      />

      <div className="space-y-6">
        {brands.map((brand) => {
          const dealMapping = brand.products.find((m) => m.dealDate === today && m.dealPriceCents != null);
          const setDealWithBrand = setDealOfTheDay.bind(null, brand.id);
          const saveGiveawayWithBrand = saveGiveawayConfig.bind(null, brand.id);
          const config = brand.giveawayConfig;
          const brandEntrants = todaysEntrants.filter((e) => e.brandId === brand.id);

          const saveCampaignWithBrand = saveCampaignPromotion.bind(null, brand.id);
          const rsStartsVal = brand.researchSetStartsAt
            ? brand.researchSetStartsAt.toISOString().slice(0, 16)
            : "";
          const rsEndsVal = brand.researchSetEndsAt
            ? brand.researchSetEndsAt.toISOString().slice(0, 16)
            : "";
          const halloweenStartsVal = brand.halloweenStartsAt
            ? brand.halloweenStartsAt.toISOString().slice(0, 16)
            : "2026-10-26T06:00";
          const halloweenEndsVal = brand.halloweenEndsAt
            ? brand.halloweenEndsAt.toISOString().slice(0, 16)
            : "2026-11-02T08:00";

          return (
            <div key={brand.id} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-4">
                <h2 className="text-sm font-semibold text-foreground-950 mb-1">
                  Deal of the Day {brands.length > 1 ? `-- ${brand.name}` : ""}
                </h2>
                <p className="text-xs text-foreground-500 mb-3">
                  Sets today's ({today} UTC) real price for one product. This is what checkout actually charges the
                  moment you save it, not just a badge -- the storefront reads it from /api/store/deal-of-the-day.
                </p>

                {dealMapping ? (
                  <div className="mb-3 flex items-center justify-between rounded-md border border-background-300 bg-background-50 px-3 py-2">
                    <div className="text-sm">
                      <span className="font-medium text-foreground-950">{dealMapping.product.chemicalName}</span>
                      <span className="text-foreground-500">
                        {" "}
                        -- {money(dealMapping.dealPriceCents ?? 0)}{" "}
                        <span className="line-through">{money(dealMapping.storePriceCents ?? 0)}</span>
                      </span>
                    </div>
                    <form action={clearDealOfTheDay.bind(null, dealMapping.id)}>
                      <button className="text-xs border border-background-300 rounded-md px-2 py-1 text-accent-700 hover:bg-accent-50">
                        Clear
                      </button>
                    </form>
                  </div>
                ) : (
                  <p className="text-xs text-foreground-500 mb-3">No deal scheduled for today.</p>
                )}

                <form action={setDealWithBrand} className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-foreground-600 mb-1">Product</label>
                    <select
                      name="storeMappingId"
                      required
                      className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                    >
                      {brand.products.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.product.chemicalName} ({money(m.storePriceCents ?? 0)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-foreground-600 mb-1">Deal price (USD)</label>
                      <input
                        name="dealPrice"
                        type="number"
                        step="0.01"
                        required
                        className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-600 mb-1">Date (UTC)</label>
                      <input
                        name="dealDate"
                        type="date"
                        defaultValue={today}
                        className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                      />
                    </div>
                  </div>
                  <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                    Set deal
                  </button>
                </form>
              </Card>

              <Card className="p-4 lg:col-span-2">
                <h2 className="text-sm font-semibold text-foreground-950 mb-1">
                  Campaign Promotions {brands.length > 1 ? `-- ${brand.name}` : ""}
                </h2>
                <p className="text-xs text-foreground-500 mb-3">
                  Automatic storefront discounts — active flag is the real gate; date guards are optional. Changes
                  take effect immediately on the next cart validation, no deploy needed.
                </p>
                <form action={saveCampaignWithBrand} className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <fieldset className="rounded-lg border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-purple-50 px-4 py-4 shadow-sm">
                    <legend className="px-2 text-sm font-bold text-orange-900">
                      Halloween Unlimited BOGO
                    </legend>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-foreground-800">
                        <input type="checkbox" name="halloweenBogoActive" defaultChecked={brand.halloweenBogoActive} />
                        Activate unlimited same-item BOGO
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-foreground-800">
                        <input type="checkbox" name="halloweenThemeActive" defaultChecked={brand.halloweenThemeActive} />
                        Activate Halloween storefront theme
                      </label>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-foreground-600">
                      Items pair up by price, any products mixed: the lower-priced item in each pair is free. Four units receive two free, six receive three free. The offer is retail-only and cannot stack.
                    </p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-foreground-600">Starts (UTC)</label>
                        <input name="halloweenStartsAt" type="datetime-local" defaultValue={halloweenStartsVal} className="w-full rounded border border-background-300 bg-white px-2 py-1.5 text-xs" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-foreground-600">Ends (UTC)</label>
                        <input name="halloweenEndsAt" type="datetime-local" defaultValue={halloweenEndsVal} className="w-full rounded border border-background-300 bg-white px-2 py-1.5 text-xs" />
                      </div>
                    </div>
                    <p className="mt-2 text-xs font-medium text-foreground-600">Free priority shipping remains automatic at $300 after the BOGO discount.</p>
                  </fieldset>
                  <fieldset className="border border-background-300 rounded-md px-3 py-2.5 space-y-2">
                    <legend className="text-xs font-semibold text-foreground-700 px-1">
                      Build Your Research Set (30% off — choose 3+)
                    </legend>
                    <label className="flex items-center gap-2 text-xs font-medium text-foreground-700">
                      <input type="checkbox" name="researchSetActive" defaultChecked={brand.researchSetActive} />
                      Active — 30% off any cart with 3 or more items
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-foreground-600 mb-1">Starts (UTC, optional)</label>
                        <input
                          name="researchSetStartsAt"
                          type="datetime-local"
                          defaultValue={rsStartsVal}
                          className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground-600 mb-1">Ends (UTC, optional)</label>
                        <input
                          name="researchSetEndsAt"
                          type="datetime-local"
                          defaultValue={rsEndsVal}
                          className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
                        />
                      </div>
                    </div>
                  </fieldset>

                  <fieldset className="border border-background-300 rounded-md px-3 py-2.5">
                    <legend className="text-xs font-semibold text-foreground-700 px-1">
                      GLP Pair Event (70% off second GLP item)
                    </legend>
                    <label className="flex items-center gap-2 text-xs font-medium text-foreground-700 mt-1">
                      <input type="checkbox" name="glpPairActive" defaultChecked={brand.glpPairActive} />
                      Enabled — uncheck to disable before the Oct 13 date window closes
                    </label>
                  </fieldset>

                  <button className="justify-self-start text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600 xl:col-span-3">
                    Save campaign settings
                  </button>
                </form>
              </Card>

              <Card className="p-4">
                <h2 className="text-sm font-semibold text-foreground-950 mb-1">
                  Giveaway {brands.length > 1 ? `-- ${brand.name}` : ""}
                </h2>
                <p className="text-xs text-foreground-500 mb-3">
                  {entriesFor(brand.id)} real {entriesFor(brand.id) === 1 ? "entry" : "entries"} today
                  {config?.enabled ? "" : " (not currently running)"}.
                </p>
                <form action={saveGiveawayWithBrand} className="space-y-2 mb-4">
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground-700">
                    <input type="checkbox" name="enabled" defaultChecked={config?.enabled ?? false} />
                    Giveaway is running
                  </label>
                  <div>
                    <label className="block text-xs font-medium text-foreground-600 mb-1">Today's prize</label>
                    <input
                      name="prizeLabel"
                      defaultValue={config?.prizeLabel ?? ""}
                      placeholder="e.g. $15 store credit"
                      className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-600 mb-1">
                      Minimum order to auto-enter (USD)
                    </label>
                    <input
                      name="minOrder"
                      type="number"
                      step="0.01"
                      defaultValue={config ? (config.minOrderCents / 100).toFixed(2) : "50.00"}
                      className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-600 mb-1">
                      Rules shown on the storefront
                    </label>
                    <textarea
                      name="rulesText"
                      defaultValue={config?.rulesText ?? ""}
                      rows={3}
                      placeholder="Include a free, no-purchase-necessary way to enter -- a purchase-only drawing is an unlawful lottery in most US states."
                      className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                    />
                  </div>
                  <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                    Save giveaway settings
                  </button>
                </form>

                {brandEntrants.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-foreground-700 mb-1">Today's entrants</h3>
                    <div className="max-h-40 overflow-y-auto text-xs text-foreground-600 space-y-1">
                      {brandEntrants.map((e) => (
                        <div key={e.id} className="flex justify-between">
                          <span>{e.email}</span>
                          <span className="text-foreground-400">{e.method === "PURCHASE" ? "purchase" : "free entry"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
