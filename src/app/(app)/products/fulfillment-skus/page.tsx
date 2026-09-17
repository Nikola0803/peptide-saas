import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { SetVvgSkusButton } from "./SetVvgSkusButton";

export default function FulfillmentSkusPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Set VVG fulfillment SKUs"
        subtitle="Matches every product against VVGOps's own SKU scheme (RET10, TIR30, BPC10, KW80, etc.) by name + dose, so the ShipStation feed sends VVG the SKU they actually expect instead of this CRM's internal one."
      />

      <div className="rounded-lg border border-background-200 bg-white p-5">
        <p className="mb-4 text-sm text-foreground-700">
          Sets the <span className="font-mono text-xs">Fulfillment SKU</span> field (see each product&rsquo;s own
          page) wherever it can confidently match a product to a row on VVG&rsquo;s pricing sheet. Anything it
          can&rsquo;t match &mdash; a new product not on their sheet yet, an ambiguous dose &mdash; is left alone and
          listed below so it can be filled in by hand instead of guessed wrong. Safe to run again any time (e.g.
          after adding new products); already-correct ones are just re-confirmed.
        </p>
        <SetVvgSkusButton />
      </div>

      <Link href="/products" className="text-sm text-foreground-500 hover:text-foreground-800">
        &larr; Back to Products
      </Link>
    </div>
  );
}
