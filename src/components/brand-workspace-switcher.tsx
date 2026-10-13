"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type BrandOption = { id: string; name: string; domain: string; status: string };

export function BrandWorkspaceSwitcher({ brands, activeBrandId }: { brands: BrandOption[]; activeBrandId: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function switchBrand(brandId: string) {
    setPending(true);
    try {
      const response = await fetch("/api/workspace/brand", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (!response.ok) throw new Error("Unable to switch workspace");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-b border-background-200 p-3">
      <label className="mb-1.5 block px-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-500">
        Store workspace
      </label>
      <select
        aria-label="Active store workspace"
        value={activeBrandId ?? "all"}
        disabled={pending}
        onChange={(event) => switchBrand(event.target.value)}
        className="w-full rounded-md border border-background-300 bg-background-50 px-3 py-2 text-sm font-semibold text-foreground-900 outline-none focus:border-primary-500 disabled:opacity-60"
      >
        <option value="all">All stores</option>
        {brands.map((brand) => (
          <option key={brand.id} value={brand.id}>{brand.name}</option>
        ))}
      </select>
      <p className="mt-1.5 truncate px-1 text-[10px] text-foreground-500">
        {activeBrandId ? brands.find((brand) => brand.id === activeBrandId)?.domain : "Combined organization view"}
      </p>
    </div>
  );
}

