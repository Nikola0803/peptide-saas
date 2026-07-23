import clsx from "clsx";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground-950">{title}</h1>
        {subtitle && <p className="text-sm text-foreground-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-background-200 bg-background-50 p-4">
      <div className="text-xs text-foreground-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-foreground-950 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-foreground-500 mt-1">{hint}</div>}
    </div>
  );
}

const badgeStyles: Record<string, string> = {
  completed: "bg-primary-100 text-primary-700",
  processing: "bg-secondary-100 text-secondary-700",
  "on-hold": "bg-accent-100 text-accent-700",
  refunded: "bg-background-200 text-foreground-600",
  connected: "bg-primary-100 text-primary-700",
  pending: "bg-accent-100 text-accent-700",
  error: "bg-accent-200 text-accent-800",
};

export function Badge({ status }: { status: string }) {
  const key = status.toLowerCase().replace(/_/g, "-");
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize whitespace-nowrap",
        badgeStyles[key] ?? "bg-background-200 text-foreground-600"
      )}
    >
      {status.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 border border-dashed border-background-300 rounded-lg">
      <div className="w-10 h-10 rounded-full bg-background-100 flex items-center justify-center mb-3">
        <i className={clsx(icon, "text-lg text-foreground-500")} />
      </div>
      <div className="text-sm font-medium text-foreground-950">{title}</div>
      <div className="text-xs text-foreground-500 mt-1 max-w-xs">{body}</div>
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-lg border border-background-200 bg-background-50", className)}>
      {children}
    </div>
  );
}
