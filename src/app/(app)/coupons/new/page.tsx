import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { CouponForm } from "./coupon-form";

export default async function NewCouponPage() {
  const { organization } = await requireOrg();

  const products = await prisma.product.findMany({
    where: { organizationId: organization.id },
    orderBy: [{ variantGroup: "asc" }, { variantLabel: "asc" }],
    select: { id: true, sku: true, chemicalName: true, variantLabel: true },
  });

  const productOptions = products.map((p) => ({
    id: p.id,
    label: p.variantLabel ? `${p.chemicalName} -- ${p.variantLabel} (${p.sku})` : `${p.chemicalName} (${p.sku})`,
  }));

  return (
    <div>
      <PageHeader
        title="New coupon"
        subtitle="Fixed, percent, or BOGO -- the wholesale-margin floor in Settings always overrides this"
        actions={
          <Link href="/coupons" className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
            Cancel
          </Link>
        }
      />
      <Card className="p-4 max-w-2xl">
        <CouponForm products={productOptions} />
      </Card>
    </div>
  );
}
