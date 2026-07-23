import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { money, shortDate } from "@/lib/format";
import {
  saveShipStationConfig,
  disconnectShipStation,
  pushOrder,
  pushAllUnshippedOrders,
  refreshShipmentStatus,
} from "./actions";

export default async function ShippingPage() {
  const { organization } = await requireOrg();

  const config = await prisma.shipStationConfig.findUnique({ where: { organizationId: organization.id } });

  const [unshipped, shipped] = await Promise.all([
    prisma.order.findMany({
      where: {
        organizationId: organization.id,
        shipstationOrderId: null,
        status: { in: ["COMPLETED", "PROCESSING"] },
      },
      include: { brand: true, contact: true },
      orderBy: { placedAt: "desc" },
      take: 50,
    }),
    prisma.order.findMany({
      where: { organizationId: organization.id, trackingNumber: { not: null } },
      include: { brand: true },
      orderBy: { shippedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div>
      <PageHeader title="Shipping" subtitle="Fulfillment via ShipStation, across all brands" />

      {!config ? (
        <Card className="p-4 max-w-lg">
          <h2 className="text-sm font-semibold text-foreground-950 mb-1">Connect ShipStation</h2>
          <p className="text-xs text-foreground-500 mb-3">
            Find these under ShipStation → Account Settings → API Settings.
          </p>
          <form action={saveShipStationConfig} className="space-y-2">
            <input
              name="apiKey"
              placeholder="API Key"
              required
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
            <input
              name="apiSecret"
              placeholder="API Secret"
              required
              type="password"
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
            <label className="flex items-center gap-2 text-xs text-foreground-600 py-1">
              <input type="checkbox" name="autoPush" defaultChecked className="rounded" />
              Automatically push every new order to ShipStation
            </label>
            <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
              Save & test connection
            </button>
          </form>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <StatCard label="Awaiting shipment" value={String(unshipped.length)} />
            <StatCard
              label="Auto-push"
              value={config.autoPush ? "On" : "Off"}
              hint="New orders push to ShipStation automatically"
            />
            <StatCard
              label="Last synced"
              value={config.lastSyncedAt ? shortDate(config.lastSyncedAt) : "Never"}
            />
          </div>

          <div className="flex items-center gap-2 mb-6">
            <form action={pushAllUnshippedOrders}>
              <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                Sync all unshipped orders
              </button>
            </form>
            <form action={refreshShipmentStatus}>
              <button className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-800 hover:bg-background-100">
                Refresh tracking status
              </button>
            </form>
            <form action={disconnectShipStation} className="ml-auto">
              <button className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-500 hover:bg-background-100">
                Disconnect
              </button>
            </form>
          </div>

          <h2 className="text-sm font-semibold text-foreground-950 mb-3">Awaiting shipment</h2>
          {unshipped.length === 0 ? (
            <EmptyState icon="ri-ship-2-line" title="Nothing waiting" body="Every completed order has been pushed to ShipStation." />
          ) : (
            <div className="rounded-lg border border-background-200 bg-background-50 overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                    <th className="py-2 px-4 font-medium">Order</th>
                    <th className="py-2 px-4 font-medium">Customer</th>
                    <th className="py-2 px-4 font-medium">Brand</th>
                    <th className="py-2 px-4 font-medium text-right">Gross</th>
                    <th className="py-2 px-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {unshipped.map((o) => (
                    <tr key={o.id} className="border-b border-background-100 last:border-0">
                      <td className="py-2.5 px-4 font-mono text-xs text-foreground-800">#{o.externalOrderNumber}</td>
                      <td className="py-2.5 px-4 text-foreground-700">{o.contact?.email ?? "—"}</td>
                      <td className="py-2.5 px-4 text-foreground-700">{o.brand.name}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums">{money(o.grossCents)}</td>
                      <td className="py-2.5 px-4 text-right">
                        <form action={pushOrder.bind(null, o.id)}>
                          <button className="text-xs bg-primary-500 text-background-50 rounded px-2.5 py-1 font-medium hover:bg-primary-600">
                            Push
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="text-sm font-semibold text-foreground-950 mb-3">Recently shipped</h2>
          {shipped.length === 0 ? (
            <p className="text-xs text-foreground-500">No shipped orders yet.</p>
          ) : (
            <div className="rounded-lg border border-background-200 bg-background-50 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                    <th className="py-2 px-4 font-medium">Order</th>
                    <th className="py-2 px-4 font-medium">Brand</th>
                    <th className="py-2 px-4 font-medium">Carrier</th>
                    <th className="py-2 px-4 font-medium">Tracking #</th>
                    <th className="py-2 px-4 font-medium text-right">Shipped</th>
                  </tr>
                </thead>
                <tbody>
                  {shipped.map((o) => (
                    <tr key={o.id} className="border-b border-background-100 last:border-0">
                      <td className="py-2.5 px-4 font-mono text-xs text-foreground-800">#{o.externalOrderNumber}</td>
                      <td className="py-2.5 px-4 text-foreground-700">{o.brand.name}</td>
                      <td className="py-2.5 px-4 text-foreground-600 text-xs uppercase">{o.carrierCode}</td>
                      <td className="py-2.5 px-4 font-mono text-xs text-foreground-800">{o.trackingNumber}</td>
                      <td className="py-2.5 px-4 text-right text-xs text-foreground-500">
                        {o.shippedAt ? shortDate(o.shippedAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
