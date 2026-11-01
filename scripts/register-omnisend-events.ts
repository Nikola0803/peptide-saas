import { ensureEvlvEventSchemas, pushCustomEventToOmnisend } from "../src/lib/omnisend";
import { prisma } from "../src/lib/prisma";

async function main() {
  const ok = await ensureEvlvEventSchemas();
  if (!ok) {
  console.warn("Omnisend event schemas were not registered (API key missing or request failed).");
  process.exitCode = 1;
  } else {
  console.log("Omnisend event schemas are ready.");
  const organization = await prisma.organization.findFirst({
    where: { notifyEmail: { not: null } },
    select: { notifyEmail: true },
  });
  if (!organization?.notifyEmail) {
    console.warn("No internal notification email is configured; skipped custom-event smoke tests.");
  } else {
    const testProperties = {
      productName: "CRM integration test",
      productSKU: "INTEGRATION-TEST",
      productURL: "https://evlvpeptides.com/shop",
      productImageURL: "https://evlvpeptides.com/favicon.ico",
      documentationURL: "https://evlvpeptides.com/coas",
      batchNumber: "INTEGRATION-TEST",
    };
    for (const eventName of ["back-in-stock", "new-batch-released"]) {
      const sent = await pushCustomEventToOmnisend({ eventName, email: organization.notifyEmail, properties: testProperties });
      if (!sent) process.exitCode = 1;
    }
    console.log("Omnisend custom-event smoke tests sent to the internal notification contact.");
  }
  }
}

main()
  .catch((error) => {
    console.error("Omnisend event registration failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
