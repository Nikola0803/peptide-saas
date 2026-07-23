import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import { CopyableField } from "@/components/copyable-field";
import { createBrand, deleteBrand } from "./actions";

export default async function WebhooksPage() {
  const { organization } = await requireOrg();

  const brands = await prisma.brand.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <PageHeader title="Webhooks" subtitle="Point each WooCommerce store at the central ingestion endpoint" />

      <Card className="p-4 mb-6">
        <h2 className="text-sm font-semibold text-foreground-950 mb-1">1. Install the plugin, once per site</h2>
        <p className="text-xs text-foreground-500 mb-3 max-w-2xl">
          Download the Command Center Connector plugin, activate it on the WooCommerce site, and paste in the
          organization API key below. The plugin registers the site automatically on activation — a new brand
          appears on this page within a few seconds, with no manual setup here.
        </p>
        <CopyableField label="Organization API key" value={organization.apiKey} monospace />
        <a
          href="/downloads/command-center-connector.zip"
          download
          className="inline-flex items-center gap-1.5 mt-3 text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600 w-fit"
        >
          <i className="ri-download-2-line" />
          Download WordPress plugin
        </a>
      </Card>

      <Card className="p-4 mb-6">
        <h2 className="text-sm font-semibold text-foreground-950 mb-1">2. Or add a site manually</h2>
        <p className="text-xs text-foreground-500 mb-3 max-w-2xl">
          For a site that isn't running WooCommerce/the plugin — you'll get a delivery URL and secret below to wire
          up by hand on whatever platform it is.
        </p>
        <form action={createBrand} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] text-foreground-500 mb-1">Name</label>
            <input
              name="name"
              required
              placeholder="Delta Peptides"
              className="text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
          </div>
          <div>
            <label className="block text-[11px] text-foreground-500 mb-1">Domain</label>
            <input
              name="domain"
              required
              placeholder="deltapeptides.com"
              className="text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
          </div>
          <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
            Add brand
          </button>
        </form>
      </Card>

      <div>
        <h2 className="text-sm font-semibold text-foreground-950 mb-3">Brands</h2>
        {brands.length === 0 ? (
          <p className="text-sm text-foreground-500">
            No brands yet — install the plugin on your first WooCommerce site, or add one manually above.
          </p>
        ) : (
          <div className="space-y-3">
            {brands.map((b) => (
              <Card key={b.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium text-foreground-950">{b.name}</div>
                    <div className="text-xs text-foreground-500">{b.domain}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={b.status} />
                    <form action={deleteBrand.bind(null, b.id)}>
                      <button className="text-xs text-foreground-400 hover:text-accent-700" title="Remove brand">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <CopyableField
                    label="Delivery URL"
                    value={`${process.env.NEXTAUTH_URL ?? ""}/api/webhooks/woocommerce?store=${b.id}`}
                    monospace
                  />
                  <CopyableField label="Webhook secret" value={b.webhookSecret} monospace />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
