import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { shortDate } from "@/lib/format";
import {
  connectInstagramAccount,
  disconnectInstagramAccount,
  toggleInstagramAccount,
  createAutomation,
  toggleAutomation,
  deleteAutomation,
} from "./actions";

const TRIGGER_LABELS: Record<string, string> = {
  COMMENT_KEYWORD: "Comment keyword",
  ANY_COMMENT: "Any comment",
  DM_KEYWORD: "DM keyword",
};

const TRIGGER_DESC: Record<string, string> = {
  COMMENT_KEYWORD: "Someone comments your keyword on any post",
  ANY_COMMENT: "Anyone comments on any post",
  DM_KEYWORD: "Someone DMs you a keyword",
};

export default async function InstagramPage() {
  const { organization } = await requireOrg();

  const accounts = await prisma.instagramAccount.findMany({
    where: { organizationId: organization.id },
    include: {
      automations: { orderBy: { createdAt: "asc" } },
      _count: { select: { events: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const recentEvents = await prisma.instagramEvent.findMany({
    where: { account: { organizationId: organization.id } },
    include: { automation: { select: { name: true } }, account: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const totalDmsSent = recentEvents.filter((e) => e.dmSent).length;
  const totalAccounts = accounts.length;
  const totalAutomations = accounts.reduce((s, a) => s + a.automations.length, 0);

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/instagram`;
  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "(set INSTAGRAM_WEBHOOK_VERIFY_TOKEN in .env)";

  return (
    <div>
      <PageHeader
        title="Instagram Automation"
        subtitle="Comment-to-DM and keyword triggers across multiple accounts"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-foreground-950 tabular-nums">{totalAccounts}</div>
          <div className="text-xs text-foreground-500 mt-0.5">Connected accounts</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-foreground-950 tabular-nums">{totalAutomations}</div>
          <div className="text-xs text-foreground-500 mt-0.5">Active automations</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-foreground-950 tabular-nums">{totalDmsSent}</div>
          <div className="text-xs text-foreground-500 mt-0.5">DMs sent (last 30)</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Accounts + automations */}
        <div className="lg:col-span-2 space-y-4">
          {accounts.length === 0 ? (
            <EmptyState
              icon="ri-instagram-line"
              title="No accounts connected"
              body="Connect an Instagram Business account to start automating comment-to-DM workflows."
            />
          ) : (
            accounts.map((account) => (
              <Card key={account.id} className="p-4">
                {/* Account header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground-950">@{account.username}</span>
                      <Badge status={account.active ? "connected" : "pending"} />
                    </div>
                    {account.name && <p className="text-xs text-foreground-500 mt-0.5">{account.name}</p>}
                    <p className="text-[11px] text-foreground-400 mt-0.5 font-mono">{account.igUserId}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <form action={toggleInstagramAccount.bind(null, account.id, !account.active)}>
                      <button className="text-xs border border-background-300 rounded-md px-2.5 py-1 text-foreground-700 hover:bg-background-100">
                        {account.active ? "Pause" : "Resume"}
                      </button>
                    </form>
                    <form action={disconnectInstagramAccount.bind(null, account.id)}>
                      <button className="text-xs border border-red-200 rounded-md px-2.5 py-1 text-red-600 hover:bg-red-50">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>

                {/* Automations list */}
                <div className="space-y-2 mb-4">
                  {account.automations.length === 0 ? (
                    <p className="text-xs text-foreground-400 italic">No automations yet — add one below</p>
                  ) : (
                    account.automations.map((auto) => (
                      <div key={auto.id} className="flex items-start gap-3 p-3 rounded-lg bg-background-100 border border-background-200">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-foreground-800">{auto.name}</span>
                            <span className="text-[10px] bg-primary-50 text-primary-700 rounded-full px-2 py-0.5 font-medium">
                              {TRIGGER_LABELS[auto.trigger]}
                            </span>
                            {!auto.active && (
                              <span className="text-[10px] bg-background-200 text-foreground-500 rounded-full px-2 py-0.5">Paused</span>
                            )}
                          </div>
                          {auto.keyword && (
                            <p className="text-[11px] text-foreground-500 mt-0.5">
                              Keyword: <span className="font-mono text-foreground-700">{auto.keyword}</span>
                            </p>
                          )}
                          <p className="text-[11px] text-foreground-500 mt-0.5 truncate">DM: {auto.dmMessage}</p>
                          <p className="text-[10px] text-foreground-400 mt-1">{auto.triggerCount} triggers</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <form action={toggleAutomation.bind(null, auto.id, !auto.active)}>
                            <button className="text-[11px] border border-background-300 rounded px-2 py-1 text-foreground-600 hover:bg-background-100">
                              {auto.active ? "Pause" : "Resume"}
                            </button>
                          </form>
                          <form action={deleteAutomation.bind(null, auto.id)}>
                            <button className="text-[11px] border border-red-200 rounded px-2 py-1 text-red-500 hover:bg-red-50">
                              Delete
                            </button>
                          </form>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add automation form */}
                <details className="border border-background-200 rounded-lg">
                  <summary className="px-3 py-2 text-xs font-medium text-foreground-700 cursor-pointer hover:bg-background-50 rounded-lg list-none">
                    + Add automation
                  </summary>
                  <form action={createAutomation.bind(null, account.id)} className="p-3 space-y-2 border-t border-background-200">
                    <input
                      name="name"
                      required
                      placeholder="Automation name (e.g. Guide giveaway)"
                      className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                    />
                    <select
                      name="trigger"
                      required
                      className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                    >
                      {Object.entries(TRIGGER_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label} — {TRIGGER_DESC[val]}</option>
                      ))}
                    </select>
                    <input
                      name="keyword"
                      placeholder="Trigger keyword (required for keyword triggers)"
                      className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                    />
                    <textarea
                      name="dmMessage"
                      required
                      rows={3}
                      placeholder="DM message to send…"
                      className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50 resize-none"
                    />
                    <input
                      name="publicReply"
                      placeholder='Public comment reply (optional, e.g. "Check your DMs! 📥")'
                      className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
                    />
                    <button className="w-full text-xs bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                      Create automation
                    </button>
                  </form>
                </details>
              </Card>
            ))
          )}

          {/* Recent events */}
          {recentEvents.length > 0 && (
            <Card className="p-4">
              <h2 className="text-sm font-semibold text-foreground-950 mb-3">Recent triggers</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b border-background-200 text-foreground-500">
                      <th className="py-2 px-2 font-medium">Account</th>
                      <th className="py-2 px-2 font-medium">Automation</th>
                      <th className="py-2 px-2 font-medium">Trigger</th>
                      <th className="py-2 px-2 font-medium">Keyword / text</th>
                      <th className="py-2 px-2 font-medium">Status</th>
                      <th className="py-2 px-2 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEvents.map((ev) => (
                      <tr key={ev.id} className="border-b border-background-100 last:border-0 hover:bg-background-50">
                        <td className="py-2 px-2 text-foreground-700">@{ev.account.username}</td>
                        <td className="py-2 px-2 text-foreground-700">{ev.automation?.name ?? "—"}</td>
                        <td className="py-2 px-2">
                          <span className="bg-primary-50 text-primary-700 rounded px-1.5 py-0.5 text-[10px] font-medium">
                            {TRIGGER_LABELS[ev.triggerType]}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-foreground-500 max-w-[140px] truncate">{ev.commentText ?? "—"}</td>
                        <td className="py-2 px-2">
                          {ev.dmSent ? (
                            <span className="text-green-600 font-medium">Sent</span>
                          ) : (
                            <span className="text-red-500" title={ev.dmError ?? ""}>Failed</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-foreground-400 whitespace-nowrap">{shortDate(ev.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Connect account */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-1">Connect an account</h2>
            <p className="text-xs text-foreground-500 mb-3">
              Paste your Instagram Business Account ID and a long-lived Page Access Token with{" "}
              <code className="font-mono bg-background-100 px-1 rounded">instagram_manage_messages</code> permission.
            </p>
            <form action={connectInstagramAccount} className="space-y-2">
              <input
                name="igUserId"
                required
                placeholder="Instagram Business User ID"
                className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50 font-mono"
              />
              <input
                name="accessToken"
                required
                placeholder="Access token"
                className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50 font-mono"
              />
              <button className="w-full text-xs bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                Verify & connect
              </button>
            </form>
          </Card>

          {/* Webhook setup */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-1">Meta webhook setup</h2>
            <p className="text-xs text-foreground-500 mb-3">
              In your Meta App → Webhooks → Instagram, subscribe to <strong>comments</strong> and <strong>messages</strong> fields.
            </p>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] text-foreground-400 mb-0.5 uppercase font-semibold tracking-wide">Callback URL</p>
                <p className="text-[11px] font-mono bg-background-100 rounded px-2 py-1.5 break-all text-foreground-700 select-all">
                  {webhookUrl}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-foreground-400 mb-0.5 uppercase font-semibold tracking-wide">Verify Token</p>
                <p className="text-[11px] font-mono bg-background-100 rounded px-2 py-1.5 break-all text-foreground-700 select-all">
                  {verifyToken}
                </p>
              </div>
            </div>
          </Card>

          {/* How it works */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-2">How it works</h2>
            <ol className="text-xs text-foreground-600 space-y-2 list-decimal list-inside">
              <li>Connect an Instagram Business account using a long-lived access token</li>
              <li>Create an automation with a keyword trigger (e.g. <span className="font-mono">GUIDE</span>)</li>
              <li>Post a Reel and tell viewers to comment the keyword</li>
              <li>When someone comments it, they instantly receive your DM</li>
              <li>Optionally set a public reply so others see the engagement boost</li>
            </ol>
            <p className="text-[11px] text-foreground-400 mt-3">
              Requires Meta App Review approval for public accounts.{" "}
              <a
                href="https://developers.facebook.com/docs/instagram-api/reference/ig-user/messages"
                target="_blank"
                rel="noreferrer"
                className="text-primary-600 hover:underline"
              >
                Graph API docs ↗
              </a>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
