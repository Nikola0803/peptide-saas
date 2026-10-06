"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import clsx from "clsx";
import { NAV_GROUPS } from "@/lib/nav";
import { PushNotificationManager } from "./PushNotificationManager";

export function Sidebar({
  organizationName,
  brandCount,
  pendingEnquiries,
}: {
  organizationName: string;
  brandCount: number;
  pendingEnquiries?: number;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const navContent = (
    <>
      <div className="h-16 px-5 flex items-center gap-2.5 border-b border-background-200">
        <div className="w-8 h-8 rounded-md bg-primary-500 flex items-center justify-center text-background-50">
          <i className="ri-pulse-line text-lg" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-foreground-950">Command Center</div>
          <div className="text-[11px] text-foreground-500">Multi-Brand CRM</div>
        </div>
        {/* Close button — mobile only */}
        <button
          className="ml-auto md:hidden p-1 rounded text-foreground-500 hover:text-foreground-950"
          onClick={() => setDrawerOpen(false)}
        >
          <i className="ri-close-line text-xl" />
        </button>
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
                const isSupport = item.href === "/support";
                const showBadge = isSupport && pendingEnquiries && pendingEnquiries > 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                      active
                        ? "bg-primary-500 text-background-50"
                        : "text-foreground-700 hover:bg-background-100 hover:text-foreground-950"
                    )}
                  >
                    <i className={clsx(item.icon, "text-base w-5 h-5 flex items-center justify-center")} />
                    <span className="flex-1">{item.label}</span>
                    {showBadge && (
                      <span
                        aria-label={`${pendingEnquiries} unanswered enquiries`}
                        className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-background-50"
                      >
                        {pendingEnquiries > 99 ? "99+" : pendingEnquiries}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-background-200 space-y-2">
        <PushNotificationManager />
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
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-background-50 border-b border-background-200 flex items-center px-4 gap-3">
        <button
          onClick={() => setDrawerOpen(true)}
          className="relative p-1.5 rounded-md text-foreground-700 hover:bg-background-100"
        >
          <i className="ri-menu-line text-xl" />
          {pendingEnquiries && pendingEnquiries > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-background-50">
              {pendingEnquiries > 99 ? "99+" : pendingEnquiries}
            </span>
          ) : null}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary-500 flex items-center justify-center">
            <i className="ri-pulse-line text-xs text-background-50" />
          </div>
          <span className="text-sm font-semibold text-foreground-950">Command Center</span>
        </div>
      </header>

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Sidebar — desktop: static left column; mobile: slide-out drawer */}
      <aside
        className={clsx(
          "flex flex-col bg-background-50 border-r border-background-200 transition-transform duration-200",
          // Desktop
          "md:w-60 md:shrink-0 md:h-screen md:sticky md:top-0 md:translate-x-0",
          // Mobile
          "fixed inset-y-0 left-0 z-50 w-72 h-full md:relative",
          drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {navContent}
      </aside>
    </>
  );
}
