import { Suspense } from "react";
import { requireOrg } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { DashboardKpis, DashboardKpisSkeleton } from "./kpis";
import { DashboardRevenueChart, DashboardRevenueChartSkeleton } from "./revenue-chart";
import { DashboardRecentOrders, DashboardRecentOrdersSkeleton } from "./recent-orders";
import { DashboardBrandsPanel, DashboardBrandsPanelSkeleton } from "./brands-panel";
import { DashboardFunnel, DashboardFunnelSkeleton } from "./funnel";

// Each section below fetches and streams independently. A slow query in
// one card (e.g. the revenue chart scanning every order) no longer blocks
// the KPIs or brand list from rendering — they show real data the moment
// their own query resolves, instead of the whole page waiting on the
// slowest one.
export default async function DashboardPage() {
  const { organization } = await requireOrg();

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={organization.name} />

      <Suspense fallback={<DashboardKpisSkeleton />}>
        <DashboardKpis organizationId={organization.id} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <Suspense fallback={<DashboardRevenueChartSkeleton />}>
            <DashboardRevenueChart organizationId={organization.id} />
          </Suspense>
        </div>
        <Suspense fallback={<DashboardFunnelSkeleton />}>
          <DashboardFunnel organizationId={organization.id} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Suspense fallback={<DashboardRecentOrdersSkeleton />}>
            <DashboardRecentOrders organizationId={organization.id} />
          </Suspense>
        </div>
        <Suspense fallback={<DashboardBrandsPanelSkeleton />}>
          <DashboardBrandsPanel organizationId={organization.id} />
        </Suspense>
      </div>
    </div>
  );
}
