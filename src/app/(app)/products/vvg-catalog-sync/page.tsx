import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { ApplyVvgCatalogSyncButton } from "./ApplyVvgCatalogSyncButton";

export default function VvgCatalogSyncPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sync VVG catalog (COG, SKU, stock, price)"
        subtitle="One-click apply of VVG's 2026-09-09 catalog sheet: our COG (Product.cogsCents) from their wholesale column, our own internal SKU from their SKU column, stock from their stock column, and shop price from their retail column."
      />

      <div className="rounded-lg border border-background-200 bg-white p-5">
        <p className="mb-4 text-sm text-foreground-700">
          Matches each row to a product by name + dose (same matching VVG fulfillment SKUs use), then updates
          whichever of COG / SKU / stock / shop price that row actually has a value for &mdash; a row VVG left
          blank (still &ldquo;TBD&rdquo;/on order) leaves that field alone rather than zeroing it. Doesn&rsquo;t
          touch whether a product is for sale at all (StoreMapping.active) &mdash; that&rsquo;s still
          Remove/Add from storefront on the product&rsquo;s own page. Safe to run again whenever VVG sends an
          updated sheet.
        </p>
        <ApplyVvgCatalogSyncButton />
      </div>

      <Link href="/products" className="text-sm text-foreground-500 hover:text-foreground-800">
        &larr; Back to Products
      </Link>
    </div>
  );
}
