"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { NAV_GROUPS } from "@/lib/nav";

export function Sidebar({
  organizationName,
  brandCount,
}: {
  organizationName: string;
  brandCount: number;
}) {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 border-r border-background-200 bg-background-50 flex flex-col">
      <div className="h-16 px-5 flex items-center gap-2.5 border-b border-background-200">
        <div className="w-8 h-8 rounded-md bg-primary-500 flex items-center justify-center text-background-50">
          <i className="ri-pulse-line text-lg" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-foreground-950">Command Center</div>
          <div className="text-[11px] text-foreground-500">Multi-Brand CRM</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-6 last:mb-0">
            <div className="text-[11px] uppercase tracking-wider text-foreground-500 px-3 mb-2">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                      active
                        ? "bg-primary-500 text-background-50"
                        : "text-foreground-700 hover:bg-background-100 hover:text-foreground-950"
                    )}
                  >
                    <i className={clsx(item.icon, "text-base w-5 h-5 flex items-center justify-center")} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-background-200">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-md">
          <div className="w-8 h-8 rounded-full bg-secondary-200 text-secondary-900 flex items-center justify-center text-xs font-semibold">
            {organizationName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 leading-tight min-w-0">
            <div className="text-sm font-medium text-foreground-950 truncate">{organizationName}</div>
            <div className="text-[11px] text-foreground-500 truncate">{brandCount} brands connected</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
