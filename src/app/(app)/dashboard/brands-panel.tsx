import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, Badge } from "@/components/ui";

export async function DashboardBrandsPanel({ organizationId }: { organizationId: string }) {
  const [brands, lowStockCount] = await Promise.all([
    prisma.brand.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.product.count({ where: { organizationId, masterStock: { lte: 0 } } }),
  ]);

  const pendingBrands = brands.filter((b) => b.status !== "CONNECTED");

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground-950">Brands</h2>
        <Link href="/webhooks" className="text-xs text-primary-600 font-medium hover:underline">
          Connect a brand
        </Link>
      </div>
      <div className="space-y-2">
        {brands.map((b) => (
          <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded-md border border-background-200">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground-950 truncate">{b.name}</div>
              <div className="text-xs text-foreground-500 truncate">{b.domain}</div>
            </div>
            <Badge status={b.status} />
          </div>
        ))}
        {pendingBrands.length === 0 && brands.length > 0 && (
          <p className="text-xs text-foreground-500 pt-1">All brands syncing normally.</p>
        )}
      </div>

      {lowStockCount > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-md bg-accent-50 border border-accent-200 px-3 py-2">
          <i className="ri-alert-line text-accent-600 mt-0.5" />
          <div className="text-xs text-accent-800">
            {lowStockCount} SKU{lowStockCount > 1 ? "s" : ""} out of master stock.{" "}
            <Link href="/products" className="font-medium underline">
              Review products
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}

export function DashboardBrandsPanelSkeleton() {
  return (
    <div className="rounded-lg border border-background-200 bg-background-50 p-4 h-[280px] animate-pulse">
      <div className="h-4 w-16 bg-background-200 rounded mb-4" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-11 bg-background-100 rounded mb-2" />
      ))}
    </div>
  );
}
