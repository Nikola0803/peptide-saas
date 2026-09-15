import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatCard, Badge, EmptyState } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { approveHeroesDiscount, rejectHeroesDiscount } from "./actions";

export default async function HeroesDiscountPage() {
  const { organization } = await requireOrg();

  const [pending, reviewed] = await Promise.all([
    prisma.heroesDiscountRequest.findMany({
      where: { organizationId: organization.id, reviewStatus: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.heroesDiscountRequest.findMany({
      where: { organizationId: organization.id, reviewStatus: { not: "PENDING" } },
      include: { coupon: true },
      orderBy: { reviewedAt: "desc" },
      take: 30,
    }),
  ]);

  const approvedCount = reviewed.filter((r) => r.reviewStatus === "APPROVED").length;

  return (
    <div>
      <PageHeader title="Heroes Discount" subtitle="Military & first-responder discount applications" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Pending review" value={String(pending.length)} hint={pending.length > 0 ? "Needs review" : undefined} />
        <StatCard label="Approved (recent)" value={String(approvedCount)} />
        <StatCard label="Discount issued" value="20% off, single-use" />
      </div>

      <Card className="p-4 mb-6">
        <h2 className="text-sm font-semibold text-foreground-950 mb-3">Pending applications</h2>
        {pending.length === 0 ? (
          <EmptyState icon="ri-medal-line" title="No pending applications" body="New Heroes Discount requests from evlv-site will show up here." />
        ) : (
          <ul className="text-sm divide-y divide-background-100">
            {pending.map((r) => (
              <li key={r.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-foreground-900 font-medium">{r.name}</div>
                  <div className="text-xs text-foreground-600">
                    {r.email} — {r.status}
                  </div>
                  <div className="text-xs text-foreground-500">{r.branch}</div>
                  <a
                    href={`/api/heroes-discount-proof/${r.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
                  >
                    <i className="ri-file-shield-2-line" /> View proof of service ({r.proofFilename})
                  </a>
                  <div className="text-[10px] text-foreground-400 mt-1">{shortDate(r.createdAt)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <form action={approveHeroesDiscount.bind(null, r.id)}>
                    <button className="text-xs bg-primary-500 text-background-50 rounded-md px-2.5 py-1.5 font-medium hover:bg-primary-600">
                      Approve (20% off)
                    </button>
                  </form>
                  <form action={rejectHeroesDiscount.bind(null, r.id)}>
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
          <EmptyState icon="ri-history-line" title="Nothing reviewed yet" body="Approved and rejected applications will show up here." />
        ) : (
          <ul className="text-sm divide-y divide-background-100">
            {reviewed.map((r) => (
              <li key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-foreground-900 font-medium">{r.name}</span>{" "}
                  <span className="text-xs text-foreground-500">— {r.email}</span>
                  {r.coupon && <span className="text-xs text-foreground-500"> — code {r.coupon.code}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge status={r.reviewStatus} />
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
