import { PrismaClient } from "@prisma/client";
import { DEFAULT_TEMPLATES } from "../src/lib/email";

const prisma = new PrismaClient();

// Push the current code-defined email templates into the database. Use this
// after a design refresh so old saved CRM template rows do not keep sending
// stale copy/design.
//
// Default: updates only the EVLV organization.
// Run all organizations with: ORGANIZATION_SLUG=* npx tsx scripts/sync-email-templates.ts
async function main() {
  const slug = process.env.ORGANIZATION_SLUG ?? "evlv";
  const organizations =
    slug === "*"
      ? await prisma.organization.findMany({ select: { id: true, slug: true } })
      : await prisma.organization.findMany({ where: { slug }, select: { id: true, slug: true } });

  if (organizations.length === 0) {
    throw new Error(`No organizations found for ORGANIZATION_SLUG=${slug}`);
  }

  let count = 0;
  for (const organization of organizations) {
    for (const template of DEFAULT_TEMPLATES) {
      await prisma.emailTemplate.upsert({
        where: { organizationId_key: { organizationId: organization.id, key: template.key } },
        update: { name: template.name, subject: template.subject, html: template.html },
        create: {
          organizationId: organization.id,
          key: template.key,
          name: template.name,
          subject: template.subject,
          html: template.html,
        },
      });
      count++;
    }
    console.log(`Synced ${DEFAULT_TEMPLATES.length} templates for ${organization.slug}`);
  }

  console.log(`Done. ${count} email template row(s) upserted.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
