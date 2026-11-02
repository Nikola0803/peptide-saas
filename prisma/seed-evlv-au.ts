import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const organization = await prisma.organization.findUnique({ where: { slug: "evlv" } });
  if (!organization) throw new Error('EVLV organization is missing. Run "npm run db:seed:evlv" first.');

  const brand = await prisma.brand.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug: "evlv-au" } },
    update: { name: "EVLV Australia", domain: "evlvpeptides.com.au", supportEmail: "support@evlvpeptides.com.au", senderName: "EVLV Australia", status: "CONNECTED", verifiedAt: new Date() },
    create: { organizationId: organization.id, slug: "evlv-au", name: "EVLV Australia", domain: "evlvpeptides.com.au", supportEmail: "support@evlvpeptides.com.au", senderName: "EVLV Australia", status: "CONNECTED", verifiedAt: new Date(), lastSyncedAt: new Date() },
  });

  await prisma.trackingConfig.upsert({ where: { brandId: brand.id }, update: {}, create: { brandId: brand.id } });
  const tracking = await prisma.trackingConfig.findUniqueOrThrow({ where: { brandId: brand.id } });
  console.log("EVLV Australia CRM brand ready.");
  console.log(`CRM_STORE_DOMAIN=${brand.domain}`);
  console.log(`CRM_ORG_API_KEY=${organization.apiKey}`);
  console.log(`CRM_CONTACT_FORM_KEY=${tracking.publicKey}`);
  console.log(`NEXT_PUBLIC_CRM_TRACKING_KEY=${tracking.publicKey}`);
  console.log("No catalog was copied. Add reviewed AU mappings/prices separately.");
}

main().finally(() => prisma.$disconnect());
