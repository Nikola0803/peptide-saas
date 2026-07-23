import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, EmptyState } from "@/components/ui";
import { money, shortDate, initials } from "@/lib/format";

export default async function ContactsPage() {
  const { organization } = await requireOrg();

  const contacts = await prisma.contact.findMany({
    where: { organizationId: organization.id },
    include: {
      brandLinks: { include: { brand: true } },
      orders: { orderBy: { placedAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = contacts.map((c) => {
    const ltv = c.orders.reduce((sum, o) => sum + o.grossCents, 0);
    const lastOrder = c.orders[0]?.placedAt;
    return { contact: c, ltv, lastOrder, orderCount: c.orders.length };
  });

  const combinedLtv = rows.reduce((s, r) => s + r.ltv, 0);
  const averageLtv = rows.length ? combinedLtv / rows.length : 0;

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle="Unified customer identities across all brands"
        actions={
          <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
            Sync all brands
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total contacts" value={String(rows.length)} />
        <StatCard label="Combined LTV" value={money(combinedLtv)} />
        <StatCard label="Average LTV" value={money(averageLtv)} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="ri-user-heart-line"
          title="No contacts yet"
          body="Contacts are created automatically the first time each brand's store reports an order for that email."
        />
      ) : (
        <div className="rounded-lg border border-background-200 bg-background-50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-500 border-b border-background-200">
                <th className="py-2.5 px-4 font-medium">Customer</th>
                <th className="py-2.5 px-4 font-medium">Brands purchased from</th>
                <th className="py-2.5 px-4 font-medium text-right">Orders</th>
                <th className="py-2.5 px-4 font-medium text-right">Lifetime value</th>
                <th className="py-2.5 px-4 font-medium">Last order</th>
                <th className="py-2.5 px-4 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ contact, ltv, lastOrder, orderCount }) => (
                <tr key={contact.id} className="border-b border-background-100 last:border-0">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-secondary-100 text-secondary-900 flex items-center justify-center text-xs font-semibold shrink-0">
                        {initials(contact.email)}
                      </div>
                      <span className="text-foreground-800">{contact.email}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-foreground-600 text-xs">
                    {contact.brandLinks.map((l) => l.brand.name).join(", ") || "—"}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">{orderCount}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium">{money(ltv)}</td>
                  <td className="py-3 px-4 text-foreground-600 text-xs">
                    {lastOrder ? shortDate(lastOrder) : "—"}
                  </td>
                  <td className="py-3 px-4 text-foreground-600 text-xs">{shortDate(contact.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
