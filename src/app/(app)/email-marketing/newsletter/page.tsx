import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { sendNewsletter } from "./actions";

export default async function NewsletterPage() {
  const { organization } = await requireOrg();

  const [optedInCount, sends] = await Promise.all([
    prisma.contact.count({ where: { organizationId: organization.id, marketingOptIn: true } }),
    prisma.newsletter.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div>
      <PageHeader
        title="Newsletter"
        subtitle="Send to everyone who opted in at registration — no Mailchimp subscription needed"
        actions={
          <Link href="/email-marketing" className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
            Back
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <StatCard label="Opted-in recipients" value={String(optedInCount)} hint="Contacts with marketingOptIn set" />

          <form action={sendNewsletter} className="space-y-3 mt-4">
            <div>
              <label className="text-xs font-medium text-foreground-600 mb-1 block">Subject</label>
              <input
                name="subject"
                required
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground-600 mb-1 block">
                HTML body — <code>{"{{customerName}}"}</code> is available
              </label>
              <textarea
                name="html"
                required
                rows={16}
                placeholder="<h1>...</h1><p>Hi {{customerName}}, ...</p>"
                className="w-full text-xs border border-background-300 rounded px-2.5 py-2 bg-background-50 font-mono resize-y"
              />
            </div>
            <button
              disabled={optedInCount === 0}
              className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600 disabled:opacity-60"
            >
              Send to {optedInCount} recipient{optedInCount === 1 ? "" : "s"}
            </button>
            <p className="text-[11px] text-foreground-500">
              Sends in the background — this can take a few minutes for a real list. Refresh to see it in the history below once it's done.
            </p>
          </form>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">History</h2>
          {sends.length === 0 ? (
            <p className="text-xs text-foreground-500">Nothing sent yet.</p>
          ) : (
            <div className="space-y-2">
              {sends.map((n) => (
                <div key={n.id} className="rounded-md border border-background-200 p-2.5">
                  <p className="text-sm font-medium text-foreground-900">{n.subject}</p>
                  <p className="text-xs text-foreground-500 mt-0.5">
                    {dateTime(n.createdAt)} — {n.recipientCount} sent
                    {n.failedCount > 0 && `, ${n.failedCount} failed`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
