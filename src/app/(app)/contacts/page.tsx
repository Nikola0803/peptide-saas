import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, EmptyState } from "@/components/ui";
import { money, shortDate, initials } from "@/lib/format";
import { getActiveBrand } from "@/lib/active-brand";

function countryBadge(isoCode: string | null | undefined, brandDomain?: string): { flag: string; label: string } {
  const code = isoCode?.toUpperCase();
  if (code === "GB" || (!code && brandDomain?.endsWith(".co.uk"))) return { flag: "🇬🇧", label: "UK" };
  if (code === "AU" || (!code && brandDomain?.endsWith(".com.au"))) return { flag: "🇦🇺", label: "AU" };
  if (code === "CA") return { flag: "🇨🇦", label: "CA" };
  return { flag: "🇺🇸", label: "US" };
}

export default async function ContactsPage() {
  const { organization, allowedBrandIds } = await requireOrg();
  const activeBrand = await getActiveBrand(organization.id);

  // Merge activeBrand filter with brand-access restriction
  const effectiveBrandIds = allowedBrandIds
    ? activeBrand
      ? allowedBrandIds.includes(activeBrand.id) ? [activeBrand.id] : allowedBrandIds
      : allowedBrandIds
    : activeBrand
      ? [activeBrand.id]
      : null;

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId: organization.id,
      ...(effectiveBrandIds ? { brandLinks: { some: { brandId: { in: effectiveBrandIds } } } } : {}),
    },
    include: {
      brandLinks: { include: { brand: true } },
      orders: {
        where: effectiveBrandIds ? { brandId: { in: effectiveBrandIds } } : undefined,
        orderBy: { placedAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = contacts.map((c) => {
    const ltv = c.orders.reduce((sum, o) => sum + o.grossCents, 0);
    const lastOrder = c.orders[0]?.placedAt;
    // Country from most recent order's shipping address (primary source).
    // Falls back to brand domain when no order yet.
    const primaryBrandDomain = c.brandLinks[0]?.brand.domain;
    const country = countryBadge(c.orders[0]?.shipToCountry, primaryBrandDomain);
    return { contact: c, ltv, lastOrder, orderCount: c.orders.length, country };
  });

  const combinedLtv = rows.reduce((s, r) => s + r.ltv, 0);
  const averageLtv = rows.length ? combinedLtv / rows.length : 0;

  return (
    <div>
      <PageHeader title="Contacts" subtitle={activeBrand ? `${activeBrand.name} customers` : "Unified customer identities across all stores"} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total contacts" value={String(rows.length)} />
        <StatCard label="Combined LTV" value={money(combinedLtv)} />
        <StatCard label="Average LTV" value={money(averageLtv)} />
        <StatCard label="Marketing opt-in" value={String(rows.filter((r) => r.contact.marketingOptIn).length)} hint="Eligible for the in-house newsletter" />
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
                <th className="py-2.5 px-4 font-medium">Site &amp; Country</th>
                <th className="py-2.5 px-4 font-medium">Marketing</th>
                <th className="py-2.5 px-4 font-medium text-right">Orders</th>
                <th className="py-2.5 px-4 font-medium text-right">Lifetime value</th>
                <th className="py-2.5 px-4 font-medium">Last order</th>
                <th className="py-2.5 px-4 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ contact, ltv, lastOrder, orderCount, country }) => (
                <tr key={contact.id} className="border-b border-background-100 last:border-0 hover:bg-background-100">
                  <td className="py-3 px-4">
                    <Link href={`/contacts/${contact.id}`} className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-secondary-100 text-secondary-900 flex items-center justify-center text-xs font-semibold shrink-0">
                        {initials(contact.email)}
                      </div>
                      <span className="text-foreground-800 hover:underline">{contact.name || contact.email}</span>
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="inline-flex items-center gap-0.5 rounded bg-background-200 px-1.5 py-0.5 text-[10px] font-semibold text-foreground-700">
                        {country.flag} {country.label}
                      </span>
                      {contact.brandLinks.length === 0 ? (
                        <span className="text-foreground-400 text-xs">—</span>
                      ) : (
                        contact.brandLinks.map((l) => (
                          <span
                            key={l.brand.id}
                            className="inline-flex items-center gap-1 rounded bg-secondary-100 px-1.5 py-0.5 text-[10px] font-medium text-secondary-800"
                          >
                            {l.brand.name}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs">
                    {contact.marketingOptIn ? (
                      <span className="text-secondary-700">Opted in</span>
                    ) : (
                      <span className="text-foreground-400">—</span>
                    )}
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
