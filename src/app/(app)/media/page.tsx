import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import { UploadForm } from "./upload-form";
import { MediaCard } from "./media-card";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function MediaPage() {
  const { organization } = await requireOrg();

  const media = await prisma.media.findMany({
    where: { organizationId: organization.id },
    orderBy: { uploadedAt: "desc" },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "";

  return (
    <div>
      <PageHeader title="Media" subtitle="Images and PDFs for product photos, COAs, logos, and email content — upload once, paste the URL anywhere" />

      <div className="mb-6">
        <UploadForm />
      </div>

      {media.length === 0 ? (
        <EmptyState icon="ri-image-line" title="Nothing uploaded yet" body="Drag a file into the box above to get started." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {media.map((m) => (
            <MediaCard
              key={m.id}
              id={m.id}
              url={m.url}
              absoluteUrl={`${baseUrl}${m.url}`}
              filename={m.filename}
              mimeType={m.mimeType}
              sizeLabel={formatSize(m.sizeBytes)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
