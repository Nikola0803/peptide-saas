import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { CopyableField } from "@/components/copyable-field";
import { saveMetaConfig, saveTiktokConfig, saveGa4Config } from "./actions";
import { dateTime } from "@/lib/format";
import { getBaseUrl } from "@/lib/base-url";

export default async function TrackingPixelsPage() {
  const { organization } = await requireOrg();

  const brands = await prisma.brand.findMany({
    where: { organizationId: organization.id },
    include: { trackingConfig: true },
    orderBy: { name: "asc" },
  });

  const [eventCounts, recentEvents] = await Promise.all([
    prisma.trackingEvent.groupBy({
      by: ["eventName"],
      where: { organizationId: organization.id },
      _count: true,
    }),
    prisma.trackingEvent.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { brand: true },
    }),
  ]);

  const countFor = (name: string) => eventCounts.find((c) => c.eventName === name)?._count ?? 0;

  return (
    <div>
      <PageHeader
        title="Tracking & Pixels"
        subtitle="First-party conversion tracking, relayed server-side to Meta, TikTok, and GA4"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Page views" value={countFor("page_view").toLocaleString()} />
        <StatCard label="Product views" value={countFor("view_content").toLocaleString()} />
        <StatCard label="Add to cart" value={countFor("add_to_cart").toLocaleString()} />
        <StatCard label="Purchases" value={countFor("purchase").toLocaleString()} />
      </div>

      <div className="space-y-4">
        {brands.map((brand) => (
          <Card key={brand.id} className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-1">{brand.name}</h2>
            <p className="text-xs text-foreground-500 mb-3">
              Add this to every page of {brand.domain} (e.g. your theme&apos;s header template):
            </p>
            <CopyableField
              label="Embed snippet"
              value={`<script src="${getBaseUrl()}/pixel.js" data-key="${brand.trackingConfig?.publicKey}" async></script>`}
              monospace
            />
            <p className="text-xs text-foreground-500 mt-2 mb-4">
              Page views fire automatically. Call{" "}
              <code className="font-mono">
                window.cc(&apos;track&apos;, &apos;purchase&apos;, {"{"} valueCents, currency, email {"}"})
              </code>{" "}
              from your thank-you page for conversions.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-background-200">
              <form action={saveMetaConfig} className="space-y-2">
                <input type="hidden" name="brandId" value={brand.id} />
                <div className="text-xs font-medium text-foreground-700 flex items-center gap-1.5">
                  <i className="ri-facebook-circle-line text-secondary-600" /> Meta
                </div>
                <input
                  name="metaPixelId"
                  placeholder="Pixel ID"
                  defaultValue={brand.trackingConfig?.metaPixelId ?? ""}
                  className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
                />
                <input
                  name="metaAccessToken"
                  placeholder="Conversions API access token"
                  defaultValue={brand.trackingConfig?.metaAccessToken ?? ""}
                  className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
                />
                <button className="text-xs border border-background-300 rounded px-2.5 py-1 text-foreground-700 hover:bg-background-100">
                  Save
                </button>
              </form>

              <form action={saveTiktokConfig} className="space-y-2">
                <input type="hidden" name="brandId" value={brand.id} />
                <div className="text-xs font-medium text-foreground-700 flex items-center gap-1.5">
                  <i className="ri-tiktok-line text-foreground-800" /> TikTok
                </div>
                <input
                  name="tiktokPixelId"
                  placeholder="Pixel ID"
                  defaultValue={brand.trackingConfig?.tiktokPixelId ?? ""}
                  className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
                />
                <input
                  name="tiktokAccessToken"
                  placeholder="Events API access token"
                  defaultValue={brand.trackingConfig?.tiktokAccessToken ?? ""}
                  className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
                />
                <button className="text-xs border border-background-300 rounded px-2.5 py-1 text-foreground-700 hover:bg-background-100">
                  Save
                </button>
              </form>

              <form action={saveGa4Config} className="space-y-2">
                <input type="hidden" name="brandId" value={brand.id} />
                <div className="text-xs font-medium text-foreground-700 flex items-center gap-1.5">
                  <i className="ri-google-line text-accent-600" /> GA4
                </div>
                <input
                  name="ga4MeasurementId"
                  placeholder="Measurement ID (G-XXXX)"
                  defaultValue={brand.trackingConfig?.ga4MeasurementId ?? ""}
                  className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
                />
                <input
                  name="ga4ApiSecret"
                  placeholder="Measurement Protocol API secret"
                  defaultValue={brand.trackingConfig?.ga4ApiSecret ?? ""}
                  className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
                />
                <button className="text-xs border border-background-300 rounded px-2.5 py-1 text-foreground-700 hover:bg-background-100">
                  Save
                </button>
              </form>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-foreground-950 mb-3">Recent events</h2>
        <div className="rounded-lg border border-background-200 bg-background-50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                <th className="py-2 px-4 font-medium">Event</th>
                <th className="py-2 px-4 font-medium">Brand</th>
                <th className="py-2 px-4 font-medium">Relayed to</th>
                <th className="py-2 px-4 font-medium text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((e) => (
                <tr key={e.id} className="border-b border-background-100 last:border-0">
                  <td className="py-2.5 px-4 font-mono text-xs text-foreground-800">{e.eventName}</td>
                  <td className="py-2.5 px-4 text-foreground-700">{e.brand.name}</td>
                  <td className="py-2.5 px-4 text-xs text-foreground-500">
                    {[e.relayedMeta && "Meta", e.relayedTiktok && "TikTok", e.relayedGa4 && "GA4"]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="py-2.5 px-4 text-right text-xs text-foreground-500">{dateTime(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
