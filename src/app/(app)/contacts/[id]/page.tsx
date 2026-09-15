import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";
import { money, shortDate, dateTime, initials } from "@/lib/format";
import { updateContact, assignPersonalCoupon, revokePersonalCoupon } from "../actions";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { organization } = await requireOrg();
  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, organizationId: organization.id },
    include: {
      brandLinks: { include: { brand: true } },
      orders: { orderBy: { placedAt: "desc" }, include: { brand: true } },
      personalCoupons: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!contact) notFound();

  const ltv = contact.orders.reduce((s, o) => s + o.grossCents, 0);
  const ordersWithCoupon = contact.orders.filter((o) => o.appliedCouponCodes).length;
  const updateWithId = updateContact.bind(null, contact.id);
  const assignCouponWithId = assignPersonalCoupon.bind(null, contact.id);

  return (
    <div>
      <Link href="/contacts" className="text-xs text-foreground-500 hover:text-foreground-800 mb-2 inline-block">
        ← Contacts
      </Link>
      <PageHeader title={contact.name || contact.email} subtitle={contact.name ? contact.email : "Customer profile"} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Lifetime value" value={money(ltv)} />
        <StatCard label="Orders" value={String(contact.orders.length)} hint={ordersWithCoupon > 0 ? `${ordersWithCoupon} used a coupon` : undefined} />
        <StatCard label="Joined" value={shortDate(contact.createdAt)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-3">Order history</h2>
            {contact.orders.length === 0 ? (
              <p className="text-xs text-foreground-500">No orders yet.</p>
            ) : (
              <ul className="text-sm divide-y divide-background-100">
                {contact.orders.map((o) => (
                  <li key={o.id} className="py-2.5 flex items-center justify-between gap-2">
                    <Link href={`/orders/${o.id}`} className="text-primary-600 hover:underline">
                      {o.externalOrderNumber}
                    </Link>
                    <span className="text-xs text-foreground-500">{o.brand.name}</span>
                    <Badge status={o.status.toLowerCase()} />
                    {o.appliedCouponCodes && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary-100 text-secondary-700">
                        {o.appliedCouponCodes}
                      </span>
                    )}
                    <span className="tabular-nums font-medium">{money(o.grossCents)}</span>
                    <span className="text-xs text-foreground-500">{shortDate(o.placedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-full bg-secondary-100 text-secondary-900 flex items-center justify-center text-xs font-semibold shrink-0">
                {initials(contact.email)}
              </div>
              <span className="text-sm text-foreground-800 truncate">{contact.email}</span>
            </div>
            <form action={updateWithId} className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-foreground-500 mb-1">Name</label>
                <input
                  name="name"
                  defaultValue={contact.name ?? ""}
                  className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground-700">
                <input type="checkbox" name="marketingOptIn" defaultChecked={contact.marketingOptIn} />
                Opted in to marketing emails
              </label>
              <button className="w-full text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                Save
              </button>
            </form>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-2">Brands</h2>
            {contact.brandLinks.length === 0 ? (
              <p className="text-xs text-foreground-500">No brand links yet.</p>
            ) : (
              <ul className="text-xs text-foreground-700 space-y-1">
                {contact.brandLinks.map((l) => (
                  <li key={l.id}>{l.brand.name}</li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-1">Lifetime deal</h2>
            <p className="text-xs text-foreground-500 mb-3">
              An automated discount just for this customer -- no code to type, applied the moment they check out or
              log in.
            </p>

            {contact.personalCoupons.filter((c) => c.active).length > 0 ? (
              <ul className="space-y-2 mb-3">
                {contact.personalCoupons.filter((c) => c.active).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-background-200 px-2.5 py-2">
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-foreground-800">{c.code}</div>
                      <div className="text-[11px] text-foreground-500 truncate">
                        {c.type === "FIXED" ? `${money(c.fixedAmountCents ?? 0)} off` : `${c.percentOff ?? 0}% off`}
                        {" -- "}
                        {c.redemptionCount} redeemed
                      </div>
                    </div>
                    <form action={revokePersonalCoupon.bind(null, c.id)}>
                      <button className="text-[11px] border border-background-300 rounded px-2 py-1 text-foreground-700 hover:bg-background-100 whitespace-nowrap">
                        Revoke
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-foreground-500 mb-3">No active lifetime deal.</p>
            )}

            <form action={assignCouponWithId} className="space-y-2 border-t border-background-200 pt-3">
              <div className="flex gap-2">
                <select name="type" defaultValue="PERCENT" className="text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50">
                  <option value="PERCENT">% off</option>
                  <option value="FIXED">$ off</option>
                </select>
                <input
                  name="percentOff"
                  type="number"
                  min="1"
                  max="100"
                  placeholder="Percent"
                  className="flex-1 text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
                />
                <input
                  name="fixedAmountDollars"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Dollars"
                  className="flex-1 text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
                />
              </div>
              <input
                name="label"
                placeholder="Note (optional) -- e.g. VIP loyalty reward"
                className="w-full text-xs border border-background-300 rounded px-2 py-1.5 bg-background-50"
              />
              <button className="w-full text-xs bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                Add lifetime deal
              </button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
