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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
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
            <div>
              <label className="text-xs font-medium text-foreground-600 mb-1 block">
                HTML body — use <code>{"{{variable}}"}</code> for text (escaped) or <code>{"{{{variable}}}"}</code> for
                pre-built HTML blocks (not escaped)
              </label>
              <textarea
                name="html"
                defaultValue={html}
                required
                rows={20}
                className="w-full text-xs border border-background-300 rounded px-2.5 py-2 bg-background-50 font-mono resize-y"
              />
              <p className="text-[11px] text-foreground-500 mt-1">
                Available variables: {Object.keys(fallback.sampleVars).map((k) => `{{${k}}}`).join(", ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                Save
              </button>
              {row && (
                <form action={resetTemplate.bind(null, params.key)}>
                  <button className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
                    Reset to default
                  </button>
                </form>
              )}
            </div>
          </form>

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

        <Card className="p-0 overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-background-200 bg-background-100">
            <p className="text-xs text-foreground-500">Preview (saved version, sample data)</p>
            <p className="text-sm font-medium text-foreground-900 truncate">{previewSubject}</p>
          </div>
          <iframe title="Email preview" srcDoc={previewHtml} className="flex-1 w-full min-h-[600px] bg-white" sandbox="" />
        </Card>
      </div>
    </div>
  );
}
