import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui";

const STEPS = [
  { key: "page_view", label: "Page views" },
  { key: "view_content", label: "Product views" },
  { key: "add_to_cart", label: "Add to cart" },
  { key: "purchase", label: "Purchases" },
];

export async function DashboardFunnel({ organizationId }: { organizationId: string }) {
  const counts = await prisma.trackingEvent.groupBy({
    by: ["eventName"],
    where: { organizationId },
    _count: true,
  });

  const countFor = (name: string) => counts.find((c) => c.eventName === name)?._count ?? 0;
  const maxCount = Math.max(1, ...STEPS.map((s) => countFor(s.key)));
  const hasAnyEvents = counts.length > 0;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground-950">Conversion funnel</h2>
        <Link href="/tracking-pixels" className="text-xs text-primary-600 font-medium hover:underline">
          Manage pixels
        </Link>
      </div>
      {!hasAnyEvents ? (
        <p className="text-xs text-foreground-500 py-6 text-center">
          No tracking events yet — add the embed snippet from the Tracking & Pixels page to a brand's storefront.
        </p>
      ) : (
        <div className="space-y-2.5">
          {STEPS.map((step) => {
            const count = countFor(step.key);
            const widthPercent = Math.max(4, Math.round((count / maxCount) * 100));
            return (
              <div key={step.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-foreground-600">{step.label}</span>
                  <span className="font-medium text-foreground-800 tabular-nums">{count.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-background-200 overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full" style={{ width: `${widthPercent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function DashboardFunnelSkeleton() {
  return (
    <div className="rounded-lg border border-background-200 bg-background-50 p-4 h-[220px] animate-pulse">
      <div className="h-4 w-32 bg-background-200 rounded mb-4" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-6 bg-background-100 rounded mb-3" />
      ))}
    </div>
  );
}
