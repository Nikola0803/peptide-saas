import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import { DEFAULT_TEMPLATES, emailConfigured } from "@/lib/email";
import { DEFAULT_AUTOMATIONS, getAutomations } from "@/lib/email-automations";
import { saveEmailSettings, updateAutomation } from "./actions";

const NOT_YET_BUILT = [
  {
    name: "Referral earned",
    description: '"$10 EVLV credit has been added" -- needs a customer-facing referral/store-credit system, which doesn\'t exist yet (the Affiliate program is a separate B2B/influencer system).',
  },
  {
    name: "Credit reminder",
    description: '"You have $10 waiting" -- same missing store-credit system as Referral earned.',
  },
  {
    name: "Re-engagement",
    description: "People who stopped opening/clicking -- needs Resend delivery webhooks (open/click tracking), not wired up yet.",
  },
];

export default async function EmailPage() {
  const { organization } = await requireOrg();

  const [rows, automations] = await Promise.all([
    prisma.emailTemplate.findMany({ where: { organizationId: organization.id } }),
    getAutomations(organization.id),
  ]);
  const customized = new Set(rows.map((r) => r.key));
  const automationDefaults = new Map(DEFAULT_AUTOMATIONS.map((d) => [d.key, d]));

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

      <Card className="p-4 mb-6">
        <h2 className="text-sm font-semibold text-foreground-950 mb-1">Automations</h2>
        <p className="text-xs text-foreground-500 mb-4">
          Lifecycle emails that fire on their own -- turn one on and set how long to wait. Welcome and Order
          confirmation aren&apos;t listed here since they fire immediately at signup/checkout, not on a delay.
        </p>
        <div className="divide-y divide-background-100">
          {automations.map((a) => {
            const def = automationDefaults.get(a.key);
            return (
              <form key={a.id} action={updateAutomation.bind(null, a.id)} className="py-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 w-56 shrink-0">
                  <input type="checkbox" name="enabled" defaultChecked={a.enabled} />
                  <span className="text-sm text-foreground-800">{a.name}</span>
                </label>
                <span className="text-xs text-foreground-500 flex-1 min-w-[200px]">{def?.description}</span>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-foreground-500">wait</span>
                  <input
                    name="delayValue"
                    type="number"
                    min="0"
                    defaultValue={a.delayValue}
                    className="w-14 text-sm border border-background-300 rounded px-1.5 py-1 bg-background-50"
                  />
                  <select name="delayUnit" defaultValue={a.delayUnit} className="text-sm border border-background-300 rounded px-1.5 py-1 bg-background-50">
                    <option value="MINUTES">minutes</option>
                    <option value="HOURS">hours</option>
                    <option value="DAYS">days</option>
                  </select>
                </div>
                {a.key === "vip" && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-foreground-500">trailing 90d spend ≥ $</span>
                    <input
                      name="thresholdDollars"
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={a.thresholdCents ? a.thresholdCents / 100 : 500}
                      className="w-20 text-sm border border-background-300 rounded px-1.5 py-1 bg-background-50"
                    />
                  </div>
                )}
                <Link href={`/email-marketing/${a.templateKey}`} className="text-xs text-primary-600 hover:underline">
                  Edit content
                </Link>
                <button className="text-xs bg-primary-500 text-background-50 rounded-md px-2.5 py-1.5 font-medium hover:bg-primary-600">
                  Save
                </button>
              </form>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-background-100">
          <p className="text-xs font-medium text-foreground-600 mb-2">Not available yet</p>
          <ul className="text-xs text-foreground-500 space-y-1.5">
            {NOT_YET_BUILT.map((f) => (
              <li key={f.name}>
                <span className="font-medium text-foreground-700">{f.name}</span> — {f.description}
              </li>
            ))}
          </ul>
        </div>
      </Card>

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
