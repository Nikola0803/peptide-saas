import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { DEFAULT_TEMPLATES, renderTemplate } from "@/lib/email";
import { saveTemplate, resetTemplate, sendTestEmail } from "../actions";

export default async function EmailTemplateEditorPage({ params }: { params: { key: string } }) {
  const { organization } = await requireOrg();

  const fallback = DEFAULT_TEMPLATES.find((t) => t.key === params.key);
  if (!fallback) notFound();

  const row = await prisma.emailTemplate.findUnique({
    where: { organizationId_key: { organizationId: organization.id, key: params.key } },
  });

  const subject = row?.subject ?? fallback.subject;
  const html = row?.html ?? fallback.html;
  const previewHtml = renderTemplate(html, fallback.sampleVars);
  const previewSubject = renderTemplate(subject, fallback.sampleVars);

  return (
    <div>
      <PageHeader
        title={fallback.name}
        subtitle={fallback.description}
        actions={
          <Link href="/email-marketing" className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
            Back
          </Link>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)] gap-5 items-start">
        <Card className="p-0 overflow-hidden flex flex-col order-1">
          <div className="px-5 py-3.5 border-b border-background-200 bg-background-100 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-primary-600">Live visual preview</p>
              <p className="text-sm font-medium text-foreground-900 truncate mt-0.5">{previewSubject}</p>
            </div>
            <span className="text-[10px] rounded-full bg-primary-50 text-primary-700 border border-primary-200 px-2 py-1 whitespace-nowrap">Sample data</span>
          </div>
          <iframe title="Email preview" srcDoc={previewHtml} className="w-full min-h-[780px] bg-white" sandbox="" />
        </Card>

        <Card className="p-5 order-2 xl:sticky xl:top-4">
          <form action={saveTemplate.bind(null, params.key)} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground-600 mb-1 block">Subject</label>
              <input
                name="subject"
                defaultValue={subject}
                required
                className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50 font-mono"
              />
            </div>
            <details className="rounded-md border border-background-200 bg-background-50 group">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-medium text-foreground-700 flex items-center justify-between">
                <span>Advanced: edit email HTML</span>
                <i className="ri-arrow-down-s-line text-foreground-400 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="px-3 pb-3 border-t border-background-200 pt-3">
                <p className="text-[11px] text-foreground-500 mb-2">
                  Use <code>{"{{variable}}"}</code> for text or <code>{"{{{variable}}}"}</code> for trusted HTML blocks.
                </p>
                <textarea
                  name="html"
                  defaultValue={html}
                  required
                  rows={20}
                  className="w-full text-[11px] leading-relaxed border border-background-300 rounded px-2.5 py-2 bg-white font-mono resize-y"
                />
                <p className="text-[10px] text-foreground-500 mt-1.5 break-words">
                  Available: {Object.keys(fallback.sampleVars).map((k) => `{{${k}}}`).join(", ")}
                </p>
              </div>
            </details>
            <button className="w-full text-sm bg-primary-500 text-background-50 rounded-md px-4 py-2.5 font-semibold hover:bg-primary-600">
              Save template
            </button>
          </form>

          {row && (
            <form action={resetTemplate.bind(null, params.key)} className="mt-2">
              <button className="w-full text-xs border border-background-300 rounded-md px-3 py-2 text-foreground-600 hover:bg-background-100">
                Restore EVLV premium default
              </button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-background-200">
            <label className="text-xs font-medium text-foreground-600 mb-1 block">Send a test</label>
            <form action={sendTestEmail.bind(null, params.key)} className="flex items-center gap-2">
              <input
                name="testEmail"
                type="email"
                required
                placeholder="you@evlvpeptides.com"
                className="flex-1 text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
              />
              <button className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
                Send test
              </button>
            </form>
            <p className="text-[11px] text-foreground-500 mt-1">Sends the currently saved version with sample data filled in.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
