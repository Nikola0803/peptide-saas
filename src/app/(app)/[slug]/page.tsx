import { redirect, notFound } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function AffiliateSlugPage({ params }: { params: { slug: string } }) {
  const { organization } = await requireOrg();
  const affiliate = await prisma.affiliate.findFirst({
    where: { organizationId: organization.id, slug: params.slug },
    select: { id: true },
  });
  if (!affiliate) notFound();
  redirect(`/affiliates/${affiliate.id}`);
}
