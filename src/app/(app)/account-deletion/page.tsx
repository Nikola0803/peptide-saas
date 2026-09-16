import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatCard, Badge, EmptyState } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { approveAccountDeletion, rejectAccountDeletion } from "./actions";

export default async function AccountDeletionPage() {
  const { organization } = await requireOrg();

  const [pending, reviewed] = await Promise.all([
    prisma.accountDeletionRequest.findMany({
      where: { organizationId: organization.id, status: "PENDING" },
      include: { contact: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.accountDeletionRequest.findMany({
      where: { organizationId: organization.id, status: { not: "PENDING" } },
      include: { contact: true },
      orderBy: { reviewedAt: "desc" },
      take: 30,
    }),
  ]);

  const approvedCount = reviewed.filter((r) => r.status === "APPROVED").length;

  return (
    <div>
      <PageHeader title="Account Removal" subtitle="Customer requests to remove their account and personal data" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Pending review" value={String(pending.length)} hint={pending.length > 0 ? "Needs review" : undefined} />
        <StatCard label="Removed (recent)" value={String(approvedCount)} />
        <StatCard label="On approval" value="Contact anonymized" />
      </div>

      <Card className="p-4 mb-6">
        <h2 className="text-sm font-semibold text-foreground-950 mb-3">Pending requests</h2>
        {pending.length === 0 ? (
          <EmptyState icon="ri-user-unfollow-line" title="No pending requests" body="Account removal requests from evlv-site will show up here." />
        ) : (
          <ul className="text-sm divide-y divide-background-100">
            {pending.map((r) => (
              <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-foreground-900 font-medium">{r.contact.name || r.contact.email}</div>
                  <div className="text-xs text-foreground-600">{r.contact.email}</div>
                  <div className="text-[10px] text-foreground-400 mt-1">{shortDate(r.createdAt)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <form action={approveAccountDeletion.bind(null, r.id)}>
                    <button className="text-xs bg-primary-500 text-background-50 rounded-md px-2.5 py-1.5 font-medium hover:bg-primary-600">
                      Approve &amp; remove
                    </button>
                  </form>
                  <form action={rejectAccountDeletion.bind(null, r.id)}>
                    <button className="text-xs border border-background-300 rounded-md px-2.5 py-1.5 text-foreground-700 hover:bg-background-100">
                      Reject
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground-950 mb-3">Recently reviewed</h2>
        {reviewed.length === 0 ? (
          <EmptyState icon="ri-history-line" title="Nothing reviewed yet" body="Approved and rejected requests will show up here." />
        ) : (
          <ul className="text-sm divide-y divide-background-100">
            {reviewed.map((r) => (
              <li key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 text-foreground-900 font-medium">
                  {r.contact.name || r.contact.email} <span className="text-xs text-foreground-500 font-normal">— {r.contact.email}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge status={r.status} />
                  <span className="text-[11px] text-foreground-400">{r.reviewedAt ? shortDate(r.reviewedAt) : ""}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
