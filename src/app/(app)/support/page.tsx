import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, StatCard, Badge, EmptyState } from "@/components/ui";
import { CopyableField } from "@/components/copyable-field";
import { dateTime } from "@/lib/format";
import { saveWhatsAppConfig, disconnectWhatsApp } from "./actions";
import { getBaseUrl } from "@/lib/base-url";

export default async function SupportPage({
  searchParams,
}: {
  searchParams: { channel?: string; status?: string };
}) {
  const { organization } = await requireOrg();

  const config = await prisma.whatsAppConfig.findUnique({ where: { organizationId: organization.id } });

  const [conversations, openCount, whatsappCount, formCount] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        organizationId: organization.id,
        ...(searchParams.channel ? { channel: searchParams.channel.toUpperCase() as "WHATSAPP" | "CONTACT_FORM" } : {}),
        ...(searchParams.status ? { status: searchParams.status.toUpperCase() as "OPEN" | "CLOSED" } : {}),
      },
      orderBy: { lastMessageAt: "desc" },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, brand: true },
      take: 100,
    }),
    prisma.conversation.count({ where: { organizationId: organization.id, status: "OPEN" } }),
    prisma.conversation.count({ where: { organizationId: organization.id, channel: "WHATSAPP" } }),
    prisma.conversation.count({ where: { organizationId: organization.id, channel: "CONTACT_FORM" } }),
  ]);

  const webhookUrl = `${getBaseUrl()}/api/whatsapp/webhook`;

  return (
    <div>
      <PageHeader title="Support" subtitle="WhatsApp and contact-form messages, all in one inbox" />

      {!config && (
        <Card className="p-4 mb-6 max-w-lg">
          <h2 className="text-sm font-semibold text-foreground-950 mb-1">Connect WhatsApp</h2>
          <p className="text-xs text-foreground-500 mb-3">
            From your Meta Business app's WhatsApp settings. The webhook URL and verify token go in Meta's
            dashboard; the phone number ID and access token go here.
          </p>
          <CopyableField label="Webhook URL (for Meta's dashboard)" value={webhookUrl} monospace />
          <form action={saveWhatsAppConfig} className="space-y-2 mt-3">
            <input
              name="phoneNumberId"
              placeholder="Phone number ID"
              required
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
            <input
              name="accessToken"
              placeholder="Access token"
              required
              type="password"
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
            <input
              name="appSecret"
              placeholder="App secret"
              required
              type="password"
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
            <input
              name="verifyToken"
              placeholder="Verify token (pick any string, use it in Meta's dashboard too)"
              required
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
            <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
              Save & test connection
            </button>
          </form>
        </Card>
      )}

      {config && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-background-200 bg-background-50 px-4 py-2.5">
          <div className="text-sm text-foreground-800">
            WhatsApp connected {config.businessDisplayPhone ? `— ${config.businessDisplayPhone}` : ""}
          </div>
          <form action={disconnectWhatsApp}>
            <button className="text-xs text-foreground-500 hover:text-accent-700">Disconnect</button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Open" value={String(openCount)} />
        <StatCard label="WhatsApp" value={String(whatsappCount)} />
        <StatCard label="Contact form" value={String(formCount)} />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Link
          href="/support"
          className="text-xs border border-background-300 rounded-md px-2.5 py-1 text-foreground-700 hover:bg-background-100"
        >
          All
        </Link>
        <Link
          href="/support?channel=whatsapp"
          className="text-xs border border-background-300 rounded-md px-2.5 py-1 text-foreground-700 hover:bg-background-100"
        >
          WhatsApp
        </Link>
        <Link
          href="/support?channel=contact_form"
          className="text-xs border border-background-300 rounded-md px-2.5 py-1 text-foreground-700 hover:bg-background-100"
        >
          Contact form
        </Link>
        <Link
          href="/support?status=closed"
          className="text-xs border border-background-300 rounded-md px-2.5 py-1 text-foreground-700 hover:bg-background-100"
        >
          Closed
        </Link>
      </div>

      {conversations.length === 0 ? (
        <EmptyState
          icon="ri-chat-3-line"
          title="No messages yet"
          body="WhatsApp messages and contact-form submissions will show up here as they come in."
        />
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => {
            const preview = c.messages[0]?.body ?? "";
            return (
              <Link
                key={c.id}
                href={`/support/${c.id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-background-200 bg-background-50 px-4 py-3 hover:bg-background-100"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground-950 truncate">
                      {c.contactName || c.contactEmail || c.contactPhone || "Unknown"}
                    </span>
                    <Badge status={c.channel === "WHATSAPP" ? "connected" : "pending"} />
                    {c.brand && <span className="text-[11px] text-foreground-500">{c.brand.name}</span>}
                  </div>
                  {c.subject && <div className="text-xs text-foreground-600 mb-0.5">{c.subject}</div>}
                  <p className="text-xs text-foreground-500 truncate">{preview}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge status={c.status} />
                  <span className="text-[11px] text-foreground-400">{dateTime(c.lastMessageAt)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
