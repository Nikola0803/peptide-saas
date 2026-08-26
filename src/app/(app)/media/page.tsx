import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import { UploadForm } from "./upload-form";
import { MediaCard } from "./media-card";
import { categorizeMimeType, type MediaCategory } from "@/lib/upload";
import { getBaseUrl } from "@/lib/base-url";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILTERS: { value: MediaCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "document", label: "Docs / PDFs" },
];

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { organization } = await requireOrg();
  const { type } = await searchParams;
  const activeFilter: MediaCategory | "all" = FILTERS.some((f) => f.value === type) ? (type as MediaCategory | "all") : "all";

  const allMedia = await prisma.media.findMany({
    where: { organizationId: organization.id },
    orderBy: { uploadedAt: "desc" },
  });
  const media = activeFilter === "all" ? allMedia : allMedia.filter((m) => categorizeMimeType(m.mimeType) === activeFilter);

  const baseUrl = getBaseUrl();

  return (
    <div>
      <PageHeader title="Media" subtitle="Images, videos, and documents for product photos, COAs, logos, and email content — upload once, paste the URL anywhere" />

      <div className="mb-6">
        <UploadForm />
      </div>

      <div className="flex items-center gap-1.5 mb-4">
        {FILTERS.map((f) => {
          const count = f.value === "all" ? allMedia.length : allMedia.filter((m) => categorizeMimeType(m.mimeType) === f.value).length;
          return (
            <Link
              key={f.value}
              href={f.value === "all" ? "/media" : `/media?type=${f.value}`}
              className={`text-xs rounded-md px-3 py-1.5 font-medium transition ${
                activeFilter === f.value ? "bg-primary-500 text-background-50" : "border border-background-300 text-foreground-700 hover:bg-background-100"
              }`}
            >
              {f.label} ({count})
            </Link>
          );
        })}
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
