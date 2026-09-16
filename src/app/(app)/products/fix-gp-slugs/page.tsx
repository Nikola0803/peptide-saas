import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { FixGpSlugsButton } from "./FixGpSlugsButton";

export default function FixGpSlugsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Fix GP-1/2/3 storefront slugs"
        subtitle="One-time fix: renames the 10 gp-1/gp-2/gp-3 storefront slugs to evlv-1/evlv-2/evlv-3 so this real inventory merges into the existing branded product cards instead of showing up as a separate, oddly-named listing."
      />

      <div className="rounded-lg border border-background-200 bg-white p-5">
        <p className="mb-4 text-sm text-foreground-700">
          This only changes the storefront <span className="font-mono text-xs">slug</span> field on 10 specific
          product listings (gp-1-5mg, gp-1-10mg, gp-2-10mg, gp-2-15mg, gp-2-30mg, gp-2-60mg, gp-3-10mg, gp-3-15mg,
          gp-3-30mg, gp-3-60mg &rarr; the matching evlv-1/2/3 slugs). It does not touch price, stock, cost, or any
          other product data. Safe to click more than once -- anything already renamed is simply skipped the next
          time.
        </p>
        <FixGpSlugsButton />
      </div>

      <Link href="/products" className="text-sm text-foreground-500 hover:text-foreground-800">
        &larr; Back to Products
      </Link>
    </div>
  );
}
