import { notFound } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { sendReply, setConversationStatus } from "../actions";

export default async function ConversationPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrg();

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, organizationId: organization.id },
    include: { messages: { orderBy: { createdAt: "asc" } }, brand: true },
  });
  if (!conversation) notFound();

  const isWhatsApp = conversation.channel === "WHATSAPP";
  const isLiveChat = conversation.channel === "LIVE_CHAT";
  const channelLabel = isWhatsApp ? "WhatsApp" : isLiveChat ? "Live chat" : "Contact form";
  const channelStatus = isWhatsApp ? "connected" : isLiveChat ? "info" : "pending";

  return (
    <div>
      <PageHeader
        title={conversation.contactName || conversation.contactEmail || conversation.contactPhone || "Visitor"}
        subtitle={[conversation.contactEmail, conversation.contactPhone, conversation.brand?.name].filter(Boolean).join(" · ")}
        actions={
          <>
            <form action={setConversationStatus.bind(null, conversation.id, conversation.status === "OPEN" ? "CLOSED" : "OPEN")}>
              <button className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
                Mark {conversation.status === "OPEN" ? "closed" : "open"}
              </button>
            </form>
            <Link href="/support" className="text-sm border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100">
              Back
            </Link>
          </>
        }
      />

      <div className="flex items-center gap-2 mb-4">
        <Badge status={channelStatus as "connected" | "pending"} />
        <span className="text-xs text-foreground-500">{channelLabel}</span>
        <Badge status={conversation.status} />
        {conversation.subject && <span className="text-xs text-foreground-600">— {conversation.subject}</span>}
      </div>

      {conversation.pageUrl && (
        <div className="mb-4 text-xs text-foreground-500 bg-background-100 rounded px-3 py-1.5">
          Started on: <span className="font-mono text-foreground-700">{conversation.pageUrl}</span>
        </div>
      )}

      <Card className="p-4">
        <div className="space-y-3 mb-4 max-h-[60vh] overflow-y-auto">
          {conversation.messages.map((m) => (
            <div key={m.id} className={clsx("flex", m.direction === "OUTBOUND" ? "justify-end" : "justify-start")}>
              <div
                className={clsx(
                  "max-w-md rounded-lg px-3 py-2 text-sm",
                  m.direction === "OUTBOUND" ? "bg-primary-500 text-background-50" : "bg-background-100 text-foreground-800"
                )}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={clsx("text-[10px] mt-1", m.direction === "OUTBOUND" ? "text-primary-100" : "text-foreground-500")}>
                  {dateTime(m.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {isWhatsApp || isLiveChat || conversation.contactEmail ? (
          <form action={sendReply.bind(null, conversation.id)} className="flex items-start gap-2 pt-3 border-t border-background-200">
            <textarea
              name="body"
              required
              rows={2}
              placeholder={
                isWhatsApp
                  ? "Type a reply…"
                  : isLiveChat
                  ? "Type a reply — the visitor's widget will show it…"
                  : `Reply by email to ${conversation.contactEmail}…`
              }
              className="flex-1 text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50 resize-none"
            />
            <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600 self-stretch">
              Send
            </button>
          </form>
        ) : (
          <p className="text-xs text-foreground-500 pt-3 border-t border-background-200">
            No email address on file for this conversation — nothing to reply to.
          </p>
        )}
      </Card>
    </div>
  );
}
