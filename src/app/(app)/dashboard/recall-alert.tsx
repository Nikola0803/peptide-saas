import Link from "next/link";
import { prisma } from "@/lib/prisma";

export async function DashboardRecallAlert({ organizationId }: { organizationId: string }) {
  const recalledLots = await prisma.productLot.findMany({
    where: { status: "RECALLED", product: { organizationId } },
    include: { product: true },
    orderBy: { recalledAt: "desc" },
  });

  if (recalledLots.length === 0) return null;

  return (
    <div className="mb-6 rounded-md bg-accent-50 border border-accent-300 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <i className="ri-alert-line text-accent-700" />
        <span className="text-sm font-semibold text-accent-800">
          {recalledLots.length} batch{recalledLots.length > 1 ? "es" : ""} recalled
        </span>
      </div>
      <div className="space-y-1">
        {recalledLots.map((lot) => (
          <Link
            key={lot.id}
            href={`/products/${lot.productId}/lots/${lot.id}/recall`}
            className="block text-xs text-accent-800 hover:underline"
          >
            {lot.product.chemicalName} — lot {lot.lotNumber} → view recall list
          </Link>
        ))}
      </div>
    </div>
  );
}
