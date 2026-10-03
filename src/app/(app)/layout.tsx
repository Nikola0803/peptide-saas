import { Sidebar } from "@/components/sidebar";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { organization } = await requireOrg();

  const [brandCount, pendingLiveChatConvs] = await Promise.all([
    prisma.brand.count({
      where: { organizationId: organization.id, status: "CONNECTED" },
    }),
    prisma.conversation.findMany({
      where: { organizationId: organization.id, channel: "LIVE_CHAT", status: "OPEN" },
      select: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true } } },
    }),
  ]);

  const pendingChats = pendingLiveChatConvs.filter(
    (c) => c.messages[0]?.direction === "INBOUND"
  ).length;

  return (
    <div className="min-h-screen flex bg-background-100">
      <Sidebar organizationName={organization.name} brandCount={brandCount} pendingChats={pendingChats} />
      {/* pt-14 on mobile to clear the fixed top bar; no top padding on desktop */}
      <main className="flex-1 min-w-0 p-4 pt-[calc(3.5rem+1rem)] md:p-6 md:pt-6">{children}</main>
    </div>
  );
}
