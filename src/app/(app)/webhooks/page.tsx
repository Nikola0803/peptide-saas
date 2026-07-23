import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import { CopyableField } from "@/components/copyable-field";
import { createBrand, deleteBrand, verifyBrandOwnership } from "./actions";
import { VerifyButton } from "@/components/verify-button";

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
        <h2 className="text-sm font-semibold text-foreground-950 mb-1">Option A — install the plugin</h2>
        <p className="text-xs text-foreground-500 mb-3 max-w-2xl">
          Download the Command Center Connector plugin, activate it on the WooCommerce site, and paste in the
          organization API key below. The plugin registers and verifies the site automatically on activation.
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
        <h2 className="text-sm font-semibold text-foreground-950 mb-1">Option B — add any website</h2>
        <p className="text-xs text-foreground-500 mb-3 max-w-2xl">
          Not on WooCommerce, or don't want to install a plugin? Add the site by URL, then prove you own it with a
          verification code — same idea as Google Search Console.
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
            <label className="block text-[11px] text-foreground-500 mb-1">Website URL</label>
            <input
              name="domain"
              required
              placeholder="deltapeptides.com"
              className="text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
          </div>
          <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
            Add website
          </button>
        </form>
      </Card>

      <div>
        <h2 className="text-sm font-semibold text-foreground-950 mb-3">Brands</h2>
        {brands.length === 0 ? (
          <p className="text-sm text-foreground-500">No brands yet — use either option above.</p>
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
                    <Badge status={b.verifiedAt ? b.status : "PENDING"} />
                    <form action={deleteBrand.bind(null, b.id)}>
                      <button className="text-xs text-foreground-400 hover:text-accent-700" title="Remove brand">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>

                {!b.verifiedAt ? (
                  <div className="rounded-md bg-accent-50 border border-accent-200 p-3">
                    {b.verificationToken ? (
                      <>
                        <p className="text-xs text-accent-800 mb-2">
                          Paste this code anywhere in the page source of <span className="font-medium">{b.domain}</span>'s
                          homepage (a meta tag in the header, or just as plain text in a footer widget both work), then
                          click Verify:
                        </p>
                        <CopyableField
                          label="Verification code"
                          value={`<meta name="command-center-verification" content="${b.verificationToken}" />`}
                          monospace
                        />
                        <div className="mt-2">
                          <VerifyButton verifyAction={verifyBrandOwnership.bind(null, b.id)} />
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-accent-800">
                        This brand was added before verification codes existed — remove it and add it again to get one.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <CopyableField
                      label="Delivery URL"
                      value={`${process.env.NEXTAUTH_URL ?? ""}/api/webhooks/woocommerce?store=${b.id}`}
                      monospace
                    />
                    <CopyableField label="Webhook secret" value={b.webhookSecret} monospace />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
