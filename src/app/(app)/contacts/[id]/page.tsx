import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";
import { money, shortDate, dateTime, initials } from "@/lib/format";
import { updateContact } from "../actions";
import { SyncMailchimpButton } from "./sync-mailchimp-button";
import { mailchimpConfigured } from "@/lib/mailchimp";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { organization } = await requireOrg();
  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, organizationId: organization.id },
    include: {
      brandLinks: { include: { brand: true } },
      orders: { orderBy: { placedAt: "desc" }, include: { brand: true } },
    },
  });
  if (!contact) notFound();

  const ltv = contact.orders.reduce((s, o) => s + o.grossCents, 0);
  const updateWithId = updateContact.bind(null, contact.id);

  return (
    <div>
      <Link href="/contacts" className="text-xs text-foreground-500 hover:text-foreground-800 mb-2 inline-block">
        ← Contacts
      </Link>
      <PageHeader title={contact.name || contact.email} subtitle={contact.name ? contact.email : "Customer profile"} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Lifetime value" value={money(ltv)} />
        <StatCard label="Orders" value={String(contact.orders.length)} />
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
                  <li key={o.id} className="py-2.5 flex items-center justify-between">
                    <Link href={`/orders/${o.id}`} className="text-primary-600 hover:underline">
                      {o.externalOrderNumber}
                    </Link>
                    <span className="text-xs text-foreground-500">{o.brand.name}</span>
                    <Badge status={o.status.toLowerCase()} />
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
            <h2 className="text-sm font-semibold text-foreground-950 mb-2">Mailchimp</h2>
            {!mailchimpConfigured() ? (
              <p className="text-xs text-foreground-500">Mailchimp isn't connected for this org.</p>
            ) : !contact.marketingOptIn ? (
              <p className="text-xs text-foreground-500">Not opted in — nothing to sync.</p>
            ) : contact.mailchimpSyncedAt ? (
              <p className="text-xs text-secondary-700 mb-2">Synced {dateTime(contact.mailchimpSyncedAt)}</p>
            ) : (
              <p className="text-xs text-foreground-500 mb-2">Opted in, not synced yet.</p>
            )}
            {mailchimpConfigured() && contact.marketingOptIn && <SyncMailchimpButton contactId={contact.id} />}
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
        </div>
      </div>
    </div>
  );
}
