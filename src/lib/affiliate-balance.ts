import { prisma } from "@/lib/prisma";

export interface AffiliateStats {
  salesConfirmed: number;
  salesPending: number;
  commissionAvailableCents: number;
  commissionPendingCents: number;
}

// Available balance = commission from COMPLETED orders, minus anything
// already PAID or currently REQUESTED (so a pending/paid request can't be
// double-counted as still available -- see AFFILIATE-PORTAL.md's balance
// formula). Pending balance = commission from orders not yet COMPLETED
// (still ON_HOLD/PROCESSING), informational only, never payable yet.
export async function getAffiliateStats(affiliateId: string): Promise<AffiliateStats> {
  const attributions = await prisma.affiliateOrderAttribution.findMany({
    where: { affiliateId },
    include: { order: { select: { status: true } } },
  });

  let salesConfirmed = 0;
  let salesPending = 0;
  let commissionAvailableCents = 0;
  let commissionPendingCents = 0;

  for (const a of attributions) {
    if (a.order.status === "COMPLETED") {
      salesConfirmed += 1;
      commissionAvailableCents += a.commissionCents;
    } else if (a.order.status === "ON_HOLD" || a.order.status === "PROCESSING") {
      salesPending += 1;
      commissionPendingCents += a.commissionCents;
    }
  }

  const reserved = await prisma.affiliatePayoutRequest.aggregate({
    where: { affiliateId, status: { in: ["PAID", "REQUESTED"] } },
    _sum: { amountCents: true },
  });
  commissionAvailableCents = Math.max(0, commissionAvailableCents - (reserved._sum.amountCents ?? 0));

  return { salesConfirmed, salesPending, commissionAvailableCents, commissionPendingCents };
}

export async function getAffiliateClickCounts(affiliateId: string): Promise<{ clicks30d: number; clicksTotal: number }> {
  const [clicksTotal, clicks30d] = await Promise.all([
    prisma.affiliateClick.count({ where: { affiliateId } }),
    prisma.affiliateClick.count({ where: { affiliateId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
  ]);
  return { clicks30d, clicksTotal };
}
