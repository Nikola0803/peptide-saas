import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import { DEFAULT_TEMPLATES, emailConfigured } from "@/lib/email";
import { saveEmailSettings } from "./actions";

export default async function EmailPage() {
  const { organization } = await requireOrg();

  const rows = await prisma.emailTemplate.findMany({ where: { organizationId: organization.id } });
  const customized = new Set(rows.map((r) => r.key));

  return (
    <div>
      <PageHeader title="Email" subtitle="Transactional templates, sending, and (soon) Mailchimp newsletters" />

      {!emailConfigured() && (
        <Card className="p-4 mb-6 border-accent-300 bg-accent-50">
          <p className="text-sm text-foreground-800 font-medium">Email sending isn't configured yet</p>
          <p className="text-xs text-foreground-600 mt-1">
            Set <code className="font-mono">RESEND_API_KEY</code> and <code className="font-mono">EMAIL_FROM</code> in
            this app's <code className="font-mono">.env</code> and restart. Until then, templates can be edited and
            previewed here, but nothing actually sends.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          {DEFAULT_TEMPLATES.map((t) => (
            <Link key={t.key} href={`/email-marketing/${t.key}`}>
              <Card className="p-4 hover:border-primary-300 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-foreground-950">{t.name}</h2>
                      <Badge status={customized.has(t.key) ? "connected" : "pending"} />
                    </div>
                    <p className="text-xs text-foreground-500 mt-1">{t.description}</p>
                  </div>
                  <i className="ri-arrow-right-s-line text-foreground-400" />
                </div>
              </Card>
            </Link>
          ))}
        </div>

        <div className="space-y-4">
          <Link href="/email-marketing/newsletter">
            <Card className="p-4 hover:border-primary-300 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground-950">Newsletter</h2>
                  <p className="text-xs text-foreground-500 mt-0.5">Send to opted-in contacts, in-house (no Mailchimp needed)</p>
                </div>
                <i className="ri-arrow-right-s-line text-foreground-400" />
              </div>
            </Card>
          </Link>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-1">Notifications</h2>
            <p className="text-xs text-foreground-500 mb-3">Where the "new order" internal email goes.</p>
            <form action={saveEmailSettings} className="space-y-2">
              <input
                name="notifyEmail"
                type="email"
                defaultValue={organization.notifyEmail ?? ""}
                placeholder="office@evlvpeptides.com"
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
              <SaveButton />
            </form>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-1">Mailchimp</h2>
            <p className="text-xs text-foreground-500 mb-3">
              Reserved for the newsletter integration — saved here, not wired up to anything yet.
            </p>
            <form action={saveEmailSettings} className="space-y-2">
              <input
                name="mailchimpApiKey"
                type="password"
                defaultValue={organization.mailchimpApiKey ?? ""}
                placeholder="Mailchimp API key"
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
              <input
                name="mailchimpAudienceId"
                defaultValue={organization.mailchimpAudienceId ?? ""}
                placeholder="Audience/List ID"
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
              <SaveButton />
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SaveButton() {
  return (
    <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
      Save
    </button>
  );
}
