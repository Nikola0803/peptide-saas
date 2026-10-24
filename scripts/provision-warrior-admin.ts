import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sendEmail } from "../src/lib/email";

const prisma = new PrismaClient();
const EMAIL = "warriordistributions@gmail.com";

async function main() {
  const organization = await prisma.organization.findUnique({ where: { slug: "evlv" } });
  if (!organization) throw new Error("EVLV organization was not found");

  const existingUser = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existingUser) {
    const existingMembership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: existingUser.id, organizationId: organization.id } },
    });
    if (existingMembership) {
      if (existingMembership.role !== "ADMIN" && existingMembership.role !== "OWNER") {
        await prisma.membership.update({ where: { id: existingMembership.id }, data: { role: "ADMIN" } });
      }
      console.log(`Admin membership already exists for ${EMAIL}; credentials were not reset or resent.`);
      return;
    }
  }

  const temporaryPassword = crypto.randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash },
    create: { email: EMAIL, name: "Warrior Distributions", passwordHash },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "ADMIN" },
  });

  const delivered = await sendEmail(
    EMAIL,
    "Your EVLV CRM administrator account",
    `<h1>EVLV CRM access</h1><p>Your administrator account is ready.</p><p><strong>Login:</strong> <a href="https://crm.evlvpeptides.com/login">https://crm.evlvpeptides.com/login</a></p><p><strong>Email:</strong> ${EMAIL}<br/><strong>Temporary password:</strong> ${temporaryPassword}</p><p>Please sign in and replace this temporary password promptly.</p>`,
  );
  if (!delivered) throw new Error(`Admin account was created for ${EMAIL}, but the credential email was not delivered`);

  console.log(`Created ADMIN membership and delivered credentials to ${EMAIL}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
