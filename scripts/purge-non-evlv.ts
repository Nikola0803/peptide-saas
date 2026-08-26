import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// One-off cleanup: deletes every Organization except "evlv" (and everything
// hanging off them — Brands, Products, Contacts, Orders, Invoices, etc. all
// cascade-delete via their organizationId foreign key, see schema.prisma).
// Run once, by hand, on the VPS: `npx tsx scripts/purge-non-evlv.ts`
//
// DESTRUCTIVE AND IRREVERSIBLE. Confirmed with the account owner before
// writing this that every non-EVLV organization in this database (the
// generic "demo" seed org, "Vertalis Peptides", "Aera Peptides", "My test
// store", "Apex") is safe to delete — this instance is EVLV-only going
// forward. Do not run this against a database that still has other real
// tenants.
async function main() {
  const toDelete = await prisma.organization.findMany({
    where: { slug: { not: "evlv" } },
    select: { id: true, name: true, slug: true },
  });

  if (toDelete.length === 0) {
    console.log("Nothing to delete — only EVLV (or no orgs at all) present.");
    return;
  }

  console.log("Deleting the following organizations and everything under them:");
  for (const org of toDelete) console.log(`  - ${org.name} (${org.slug}, ${org.id})`);

  const result = await prisma.organization.deleteMany({
    where: { slug: { not: "evlv" } },
  });

  console.log(`Deleted ${result.count} organization(s). Remaining:`);
  const remaining = await prisma.organization.findMany({ select: { name: true, slug: true } });
  for (const org of remaining) console.log(`  - ${org.name} (${org.slug})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
