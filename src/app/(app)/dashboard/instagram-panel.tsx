import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, Badge } from "@/components/ui";

export async function DashboardInstagramPanel({ organizationId }: { organizationId: string }) {
  const accounts = await prisma.instagramAccount.findMany({
    where: { organizationId },
    include: {
      automations: { where: { active: true }, select: { id: true, name: true, triggerCount: true, trigger: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (accounts.length === 0) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now.getTime() - 7 * 86_400_000);

  const [dmsToday, dmsWeek, totalLeads] = await Promise.all([
    prisma.instagramEvent.count({
      where: { account: { organizationId }, dmSent: true, createdAt: { gte: startOfToday } },
    }),
    prisma.instagramEvent.count({
      where: { account: { organizationId }, dmSent: true, createdAt: { gte: startOfWeek } },
    }),
    prisma.contact.count({ where: { organizationId, instagramUserId: { not: null } } }),
  ]);

  // Top 3 automations by trigger count across all accounts
  const allAutomations = accounts.flatMap((a) => a.automations.map((au) => ({ ...au, accountUsername: a.username })));
  const topAutomations = [...allAutomations].sort((a, b) => b.triggerCount - a.triggerCount).slice(0, 3);

  const totalActive = accounts.filter((a) => a.active).length;
  const totalAutomations = accounts.reduce((s, a) => s + a.automations.length, 0);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <i className="ri-instagram-line text-base text-foreground-700" />
          <h2 className="text-sm font-semibold text-foreground-950">Instagram Automation</h2>
        </div>
        <Link href="/instagram" className="text-xs text-primary-600 font-medium hover:underline">
          Manage →
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: "DMs today", value: dmsToday },
          { label: "DMs this week", value: dmsWeek },
          { label: "CRM leads", value: totalLeads },
          { label: "Automations", value: totalAutomations },
        ].map((s) => (
          <div key={s.label} className="text-center rounded-lg bg-background-100 py-2.5">
            <div className="text-lg font-bold text-foreground-950 tabular-nums">{s.value}</div>
            <div className="text-[10px] text-foreground-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Connected accounts */}
        <div>
          <p className="text-[10px] font-semibold text-foreground-400 uppercase tracking-wide mb-2">
            Accounts ({totalActive}/{accounts.length} active)
          </p>
          <div className="space-y-1.5">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-medium text-foreground-800 truncate">@{a.username}</span>
                  <span className="text-[10px] text-foreground-400">{a.automations.length} auto</span>
                </div>
                <Badge status={a.active ? "connected" : "pending"} />
              </div>
            ))}
          </div>
        </div>

        {/* Top automations */}
        <div>
          <p className="text-[10px] font-semibold text-foreground-400 uppercase tracking-wide mb-2">Top automations</p>
          {topAutomations.length === 0 ? (
            <p className="text-xs text-foreground-400 italic">None yet</p>
          ) : (
            <div className="space-y-1.5">
              {topAutomations.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-foreground-700 truncate">{a.name}</p>
                    <p className="text-[10px] text-foreground-400">@{a.accountUsername}</p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-foreground-800 shrink-0">{a.triggerCount}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function DashboardInstagramPanelSkeleton() {
  return (
    <div className="rounded-lg border border-background-200 bg-background-50 p-4 h-[200px] animate-pulse">
      <div className="h-4 w-32 bg-background-200 rounded mb-4" />
      <div className="grid grid-cols-4 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-background-100 rounded" />)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-16 bg-background-100 rounded" />)}
      </div>
    </div>
  );
}
