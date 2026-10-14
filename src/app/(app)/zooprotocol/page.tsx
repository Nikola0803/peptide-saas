import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { getActiveBrand } from "@/lib/active-brand";
import { prisma } from "@/lib/prisma";
import { EmptyState, PageHeader, StatCard, Badge } from "@/components/ui";

export default async function ZooProtocolPage() {
  const { organization, session } = await requireOrg();
  const user = session.user as any;
  const role = user.role as string;
  const activeBrand = await getActiveBrand(organization.id);
  const unrestricted = role === "OWNER" || role === "ADMIN";
  const where = { organizationId: organization.id, ...(activeBrand ? { brandId: activeBrand.id } : {}), ...(!unrestricted ? { assignedToId: user.id } : {}) };
  const [cases, reviewCount] = await Promise.all([
    prisma.zooProtocolCase.findMany({ where, include: { dog: { include: { contact: true } }, assignedTo: true, checkIns: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" } }),
    prisma.zooProtocolCase.count({ where: { ...where, status: "NEEDS_REVIEW" } }),
  ]);
  return <div><PageHeader title="ZooProtocol" subtitle={unrestricted ? "All canine records, assignments and professional review activity" : "Canine records assigned to you"}/><div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4"><StatCard label="Accessible cases" value={String(cases.length)}/><StatCard label="Needs review" value={String(reviewCount)}/><StatCard label="Your role" value={role.replaceAll("_"," ")}/><StatCard label="Workspace" value={activeBrand?.name || "All stores"}/></div>{cases.length===0?<EmptyState icon="ri-heart-pulse-line" title="No accessible ZooProtocol cases" body={unrestricted?"Customer records will appear here after the storefront starts syncing ZooProtocol data.":"An administrator must assign a case before you can read it."}/>:<div className="overflow-x-auto rounded-lg border border-background-200 bg-background-50"><table className="w-full text-sm"><thead><tr className="border-b border-background-200 text-left text-xs text-foreground-500"><th className="px-4 py-3">Dog</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Focus</th><th className="px-4 py-3">Latest check-in</th><th className="px-4 py-3">Assigned to</th><th className="px-4 py-3">Status</th><th/></tr></thead><tbody>{cases.map(c=><tr key={c.id} className="border-b border-background-100 last:border-0"><td className="px-4 py-3 font-semibold">{c.dog.name}<div className="text-xs font-normal text-foreground-500">{c.dog.breed||"Breed not set"}</div></td><td className="px-4 py-3">{c.dog.contact.name||c.dog.contact.email}<div className="text-xs text-foreground-500">{c.dog.contact.email}</div></td><td className="px-4 py-3">{c.dog.focus||"General"}</td><td className="px-4 py-3 text-xs text-foreground-600">{c.checkIns[0]?new Date(c.checkIns[0].createdAt).toLocaleDateString():"No check-ins"}</td><td className="px-4 py-3">{c.assignedTo?.name||c.assignedTo?.email||"Unassigned"}</td><td className="px-4 py-3"><Badge status={c.status}/></td><td className="px-4 py-3 text-right"><Link href={`/zooprotocol/${c.id}`} className="font-medium text-primary-600 hover:underline">Open record</Link></td></tr>)}</tbody></table></div>}</div>;
}
