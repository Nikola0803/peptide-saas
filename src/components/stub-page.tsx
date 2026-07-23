import { PageHeader, EmptyState } from "@/components/ui";

export function StubPage({
  title,
  subtitle,
  icon,
  body,
}: {
  title: string;
  subtitle: string;
  icon: string;
  body: string;
}) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <EmptyState icon={icon} title="Not wired up yet" body={body} />
    </div>
  );
}
