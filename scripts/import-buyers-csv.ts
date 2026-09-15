import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

// One-off import of the historical WooCommerce buyer list (322 rows,
// exported as scripts/data/buyers-evlv.csv) into this app's Contact table,
// so the real customer list is here before the first Resend campaign
// launches -- not a live sync, run once by hand.
//
// Run on the VPS (needs a real DATABASE_URL): `npx tsx scripts/import-buyers-csv.ts`
// Optionally pass a different CSV path as the first argument.
//
// Deliberately CONTACTS ONLY, not Orders: the CSV's Order Count/Lifetime
// Spend columns are historical WooCommerce numbers with no per-item detail
// (product, price, date) to build real Order rows from, and this app's
// Order model expects real line items -- faking that would corrupt the
// revenue dashboard and product-sold counts with orders that don't
// reference real products. If real historical order data is needed later,
// it needs an export with line-item detail, not just totals.
//
// Marketing consent is respected, not assumed: only rows where "Marketing
// Consent" is exactly "Yes" get marketingOptIn = true. "Unknown" and "No"
// both import as false -- these are legacy WooCommerce customers who never
// affirmatively opted in to this store's own marketing, and defaulting them
// to true would mean emailing people who never agreed to it. A row marked
// "Unsubscribed" is forced to false regardless of the Marketing Consent
// value, since an explicit unsubscribe overrides an earlier opt-in.
//
// Safe to re-run: every row is an upsert keyed on (organizationId, email),
// and an existing Contact's marketingOptIn is only ever raised to true by
// this script, never lowered -- so re-running after someone has since
// opted in for real (e.g. via the newsletter form) can't undo that.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

async function main() {
  const csvPath = process.argv[2] ?? join(__dirname, "data", "buyers-evlv.csv");
  const raw = readFileSync(csvPath, "utf-8").replace(/^﻿/, "");
  const rows = parseCsv(raw);
  const header = rows[0];
  const col = (name: string) => header.indexOf(name);

  const iEmail = col("Email");
  const iFirst = col("First Name");
  const iLast = col("Last Name");
  const iConsent = col("Marketing Consent");
  const iUnsub = col("Unsubscribed");

  if (iEmail === -1) throw new Error(`CSV missing an "Email" column -- got: ${header.join(", ")}`);

  const org = await prisma.organization.findUnique({ where: { slug: "evlv" } });
  if (!org) throw new Error('No Organization with slug "evlv" found -- run prisma/seed-evlv.ts first.');
  const brand = await prisma.brand.findUnique({ where: { organizationId_slug: { organizationId: org.id, slug: "evlv" } } });
  if (!brand) throw new Error('No Brand with slug "evlv" found under the EVLV organization.');

  let created = 0;
  let updated = 0;
  let optedIn = 0;
  let skippedNoEmail = 0;
  let skippedBadEmail = 0;

  for (const r of rows.slice(1)) {
    if (r.length < header.length) continue;
    const emailRaw = (r[iEmail] ?? "").trim().toLowerCase();
    if (!emailRaw) {
      skippedNoEmail++;
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      skippedBadEmail++;
      continue;
    }

    const first = (r[iFirst] ?? "").trim();
    const last = (r[iLast] ?? "").trim();
    const name = [first, last].filter(Boolean).join(" ").trim() || null;
    const unsubscribed = (r[iUnsub] ?? "").trim().toLowerCase() === "yes";
    const consentedYes = (r[iConsent] ?? "").trim().toLowerCase() === "yes";
    const marketingOptIn = consentedYes && !unsubscribed;

    const existing = await prisma.contact.findUnique({
      where: { organizationId_email: { organizationId: org.id, email: emailRaw } },
    });

    const contact = await prisma.contact.upsert({
      where: { organizationId_email: { organizationId: org.id, email: emailRaw } },
      update: {
        name: existing?.name ?? name,
        // Never lower an existing true back to false from this import --
        // only ever raise false -> true when the CSV shows real consent.
        marketingOptIn: existing?.marketingOptIn || marketingOptIn,
      },
      create: { organizationId: org.id, email: emailRaw, name, marketingOptIn },
    });

    await prisma.contactBrandLink.upsert({
      where: { contactId_brandId: { contactId: contact.id, brandId: brand.id } },
      update: {},
      create: { contactId: contact.id, brandId: brand.id },
    });

    if (existing) updated++;
    else created++;
    if (marketingOptIn) optedIn++;
  }

  console.log(`Done. ${created} contacts created, ${updated} existing contacts touched.`);
  console.log(`${optedIn} rows carried real marketing consent from this import.`);
  if (skippedNoEmail) console.log(`${skippedNoEmail} rows skipped: no email.`);
  if (skippedBadEmail) console.log(`${skippedBadEmail} rows skipped: invalid email format.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
