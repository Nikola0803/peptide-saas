import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { CopyableField } from "@/components/copyable-field";
import { regenerateApiKey, updateBrandProfile } from "./actions";
import { SignOutButton } from "@/components/sign-out-button";

export default async function SettingsPage() {
  const { organization, session } = await requireOrg();

  const [memberCount, brandCount, brands] = await Promise.all([
    prisma.membership.count({ where: { organizationId: organization.id } }),
    prisma.brand.count({ where: { organizationId: organization.id } }),
    prisma.brand.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Settings" subtitle="Organization, plan, and connection details" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">Organization</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-foreground-500">Name</dt>
              <dd className="text-foreground-800">{organization.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground-500">Plan</dt>
              <dd className="text-foreground-800 capitalize">{organization.plan.toLowerCase()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground-500">Team members</dt>
              <dd className="text-foreground-800">{memberCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground-500">Brands connected</dt>
              <dd className="text-foreground-800">{brandCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground-500">Signed in as</dt>
              <dd className="text-foreground-800">{session.user?.email}</dd>
            </div>
          </dl>
          <div className="mt-4 pt-4 border-t border-background-200">
            <SignOutButton />
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground-950 mb-1">Plugin API key</h2>
          <p className="text-xs text-foreground-500 mb-3">
            Used by the WordPress plugin to register new brands. Regenerating it immediately invalidates the old
            key — sites that haven't re-entered the new one will stop being able to (re)register, but already
            connected brands keep syncing on their existing per-brand webhook secret.
          </p>
          <CopyableField label="Organization API key" value={organization.apiKey} monospace />
          <form action={regenerateApiKey} className="mt-3">
            <button className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-800 hover:bg-background-100">
              Regenerate key
            </button>
          </form>
        </Card>

        {brands.map((brand) => (
          <Card key={brand.id} className="p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold text-foreground-950 mb-1">{brand.name} shop profile</h2>
            <p className="text-xs text-foreground-500 mb-3">
              Used to style this brand&apos;s marketing/transactional emails and shown on its storefront.
            </p>
            <form action={updateBrandProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="hidden" name="brandId" value={brand.id} />
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1">Logo URL</label>
                <input
                  name="logoUrl"
                  defaultValue={brand.logoUrl ?? ""}
                  placeholder="https://.../logo.png"
                  className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1">Support email</label>
                <input
                  name="supportEmail"
                  type="email"
                  defaultValue={brand.supportEmail ?? ""}
                  placeholder="support@evlvpeptides.com"
                  className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1">Sender name</label>
                <input
                  name="senderName"
                  defaultValue={brand.senderName ?? ""}
                  placeholder="EVLV Team"
                  className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1">Email accent color</label>
                <input
                  name="emailAccentColor"
                  defaultValue={brand.emailAccentColor ?? ""}
                  placeholder="#B8875A"
                  className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-foreground-600 mb-1">Business address</label>
                <input
                  name="businessAddress"
                  defaultValue={brand.businessAddress ?? ""}
                  placeholder="Required on marketing emails for CAN-SPAM compliance"
                  className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                />
              </div>
              <div className="sm:col-span-2">
                <button className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-800 hover:bg-background-100">
                  Save shop profile
                </button>
              </div>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
