import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/store/coas — real lab CoaDocument PDFs for this brand's active
// storefront slugs (see StoreMapping.slug + CoaDocument, managed from the
// Master Products admin page). evlv-site's own catalog stays static
// (see StoreMapping's doc comment); this just overlays the real COA link
// per slug so the storefront never has to invent purity/date numbers.
export async function GET(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const mappings = await prisma.storeMapping.findMany({
    where: { brandId: store.brandId, active: true, slug: { not: null } },
    include: {
      product: { include: { coas: { where: { published: true }, orderBy: { createdAt: "desc" }, take: 1 } } },
    },
  });

  const coas = mappings
    .filter((m) => m.product.coas.length > 0)
    .map((m) => ({
      slug: m.slug as string,
      url: m.product.coas[0].url,
      label: m.product.coas[0].label ?? undefined,
    }));

  return NextResponse.json(coas);
}
