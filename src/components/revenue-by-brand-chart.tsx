"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function RevenueByBrandChart({ data }: { data: { name: string; gross: number; net: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--background-200))" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "oklch(var(--foreground-500))" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "oklch(var(--foreground-500))" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value: number) => `$${value.toLocaleString()}`}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid oklch(var(--background-200))" }}
        />
        <Bar dataKey="gross" name="Gross" fill="oklch(var(--primary-400))" radius={[4, 4, 0, 0]} />
        <Bar dataKey="net" name="Net profit" fill="oklch(var(--secondary-400))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
