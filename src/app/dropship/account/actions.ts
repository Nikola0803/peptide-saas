"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireSupplier } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function changePassword(formData: FormData) {
  await requireSupplier();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) throw new Error("Not signed in");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  if (newPassword.length < 8) throw new Error("New password must be at least 8 characters");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new Error("Current password is incorrect");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  revalidatePath("/dropship/account");
}

export async function updateContactEmail(formData: FormData) {
  const { supplier } = await requireSupplier();

  const contactEmail = String(formData.get("contactEmail") ?? "").trim().toLowerCase();
  if (!contactEmail) throw new Error("Contact email is required");

  await prisma.supplier.update({ where: { id: supplier.id }, data: { contactEmail } });
  revalidatePath("/dropship/account");
}
