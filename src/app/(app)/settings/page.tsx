import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { CopyableField } from "@/components/copyable-field";
import { regenerateApiKey } from "./actions";
import { SignOutButton } from "@/components/sign-out-button";

export default async function SettingsPage() {
  const { organization, session } = await requireOrg();

  const [memberCount, brandCount] = await Promise.all([
    prisma.membership.count({ where: { organizationId: organization.id } }),
    prisma.brand.count({ where: { organizationId: organization.id } }),
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
      </div>
    </div>
  );
}
