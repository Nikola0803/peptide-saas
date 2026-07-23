import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function slugifyDomain(siteUrl: string): { slug: string; domain: string } {
  const domain = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const slug = "brand_" + domain.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  return { slug, domain };
}

// POST /api/plugin/register
// body: { apiKey, siteUrl, siteName, wooConsumerKey?, wooConsumerSecret? }
//
// Called once by the WP plugin on activation (or when re-run after the
// consumer keys change). Looks the Organization up by its long-lived
// apiKey, then upserts a Brand for this site — this is the "automatic
// recognition of new websites": the operator never has to manually add a
// new store in the dashboard first, the plugin creates it on first contact.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.apiKey || !body?.siteUrl) {
    return NextResponse.json({ error: "apiKey and siteUrl are required" }, { status: 400 });
  }

  const organization = await prisma.organization.findUnique({ where: { apiKey: body.apiKey } });
  if (!organization) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const { slug, domain } = slugifyDomain(body.siteUrl);

  const brand = await prisma.brand.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug } },
    update: {
      domain,
      name: body.siteName ?? domain,
      status: "CONNECTED",
      verifiedAt: new Date(),
      wooConsumerKey: body.wooConsumerKey ?? undefined,
      wooConsumerSecret: body.wooConsumerSecret ?? undefined,
      lastSyncedAt: new Date(),
    },
    create: {
      organizationId: organization.id,
      slug,
      domain,
      name: body.siteName ?? domain,
      status: "CONNECTED",
      verifiedAt: new Date(),
      wooConsumerKey: body.wooConsumerKey ?? null,
      wooConsumerSecret: body.wooConsumerSecret ?? null,
      lastSyncedAt: new Date(),
    },
  });

  const origin = req.nextUrl.origin;

  await prisma.trackingConfig.upsert({
    where: { brandId: brand.id },
    update: {},
    create: { brandId: brand.id },
  });

  return NextResponse.json({
    brandId: brand.id,
    brandSlug: brand.slug,
    webhookSecret: brand.webhookSecret,
    webhookUrl: `${origin}/api/webhooks/woocommerce?store=${brand.id}`,
  });
}
