"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const STATUSES = ["completed", "processing", "on-hold", "refunded"];

export function OrdersFilters({ brands }: { brands: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue={searchParams.get("brand") ?? "all"}
        onChange={(e) => setParam("brand", e.target.value)}
        className="text-sm border border-background-300 rounded-md px-2.5 py-1.5 bg-background-50 text-foreground-800"
      >
        <option value="all">All brands</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      <select
        defaultValue={searchParams.get("status") ?? "all"}
        onChange={(e) => setParam("status", e.target.value)}
        className="text-sm border border-background-300 rounded-md px-2.5 py-1.5 bg-background-50 text-foreground-800"
      >
        <option value="all">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
