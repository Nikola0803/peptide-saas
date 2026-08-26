import Link from "next/link";
import { requireSupplier } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";

const DROPSHIP_NAV = [
  { label: "Orders", href: "/dropship", icon: "ri-shopping-bag-3-line" },
  { label: "Products", href: "/dropship/products", icon: "ri-flask-line" },
  { label: "Billing", href: "/dropship/billing", icon: "ri-bill-line" },
];

export default async function DropshipLayout({ children }: { children: React.ReactNode }) {
  const { supplier } = await requireSupplier();

  return (
    <div className="min-h-screen flex bg-background-100">
      <aside className="w-60 shrink-0 h-screen sticky top-0 border-r border-background-200 bg-background-50 flex flex-col">
        <div className="h-16 px-5 flex items-center gap-2.5 border-b border-background-200">
          <div className="w-8 h-8 rounded-md bg-primary-500 flex items-center justify-center text-background-50">
            <i className="ri-truck-line text-lg" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-sm font-semibold text-foreground-950 truncate">{supplier.name}</div>
            <div className="text-[11px] text-foreground-500">Supplier Portal</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4">
          <div className="space-y-0.5">
            {DROPSHIP_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap text-foreground-700 hover:bg-background-100 hover:text-foreground-950"
              >
                <i className={`${item.icon} text-base w-5 h-5 flex items-center justify-center`} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>

        <div className="p-3 border-t border-background-200">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6">{children}</main>
    </div>
  );
}
