import Link from "next/link";
import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { shortDate } from "@/lib/format";
import {
  connectInstagramAccount,
  disconnectInstagramAccount,
  toggleInstagramAccount,
  createAutomation,
  updateAutomation,
  toggleAutomation,
  deleteAutomation,
} from "./actions";

const TRIGGER_LABELS: Record<string, string> = {
  FIRST_DM: "Welcome DM",
  COMMENT_KEYWORD: "Comment keyword",
  ANY_COMMENT: "Any comment",
  DM_KEYWORD: "DM keyword",
};
const TRIGGER_DESC: Record<string, string> = {
  FIRST_DM: "Someone messages you for the first time — fires once per person, ever",
  COMMENT_KEYWORD: "Someone comments your keyword on any post",
  ANY_COMMENT: "Anyone comments on any post",
  DM_KEYWORD: "Someone DMs you a keyword",
};

// ---------------------------------------------------------------------------
// Tiny sparkline — last N days bar chart (pure SVG, no deps)
// ---------------------------------------------------------------------------
function Sparkline({ data, color = "#7c3aed" }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  const w = 140;
  const h = 36;
  const gap = 2;
  const barW = (w - gap * (data.length - 1)) / data.length;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      {data.map((v, i) => {
        const barH = Math.max(2, (v / max) * h);
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={h - barH}
            width={barW}
            height={barH}
            rx={1.5}
            fill={v === 0 ? "#e5e7eb" : color}
            opacity={v === 0 ? 0.5 : 1}
          />
        );
      })}
    </svg>
  );
}

export default async function InstagramPage() {
  const { organization } = await requireOrg();

  // Last 14 days date range
  const now = new Date();
  const d14ago = new Date(now.getTime() - 13 * 86_400_000);
  d14ago.setHours(0, 0, 0, 0);

  const [accounts, recentEvents, dmsByDay, totalLeads] = await Promise.all([
    prisma.instagramAccount.findMany({
      where: { organizationId: organization.id },
      include: {
        automations: {
          orderBy: { triggerCount: "desc" },
          include: { _count: { select: { events: true } } },
        },
        _count: { select: { events: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.instagramEvent.findMany({
      where: { account: { organizationId: organization.id } },
      include: {
        automation: { select: { name: true } },
        account: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.instagramEvent.groupBy({
      by: ["createdAt"],
      where: {
        account: { organizationId: organization.id },
        dmSent: true,
        createdAt: { gte: d14ago },
      },
      _count: true,
    }),
    prisma.contact.count({ where: { organizationId: organization.id, instagramUserId: { not: null } } }),
  ]);

  // Build day-by-day DM counts for sparkline
  const dayMap: Record<string, number> = {};
  for (const row of dmsByDay) {
    const key = row.createdAt.toISOString().slice(0, 10);
    dayMap[key] = (dayMap[key] ?? 0) + row._count;
  }
  const sparkData: number[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    sparkData.push(dayMap[d.toISOString().slice(0, 10)] ?? 0);
  }

  const totalAccounts = accounts.length;
  const totalAutomations = accounts.reduce((s, a) => s + a.automations.length, 0);
  const todayKey = now.toISOString().slice(0, 10);
  const dmsToday = dayMap[todayKey] ?? 0;
  const dmsTotal = sparkData.reduce((s, n) => s + n, 0);

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/instagram`;
  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "(set INSTAGRAM_WEBHOOK_VERIFY_TOKEN in .env)";

  return (
    <div>
      <PageHeader
        title="Instagram Automation"
        subtitle="Comment-to-DM and keyword triggers across all connected accounts"
      />

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-2xl font-bold text-foreground-950 tabular-nums">{totalAccounts}</div>
          <div className="text-xs text-foreground-500 mt-0.5">Connected accounts</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-foreground-950 tabular-nums">{totalAutomations}</div>
          <div className="text-xs text-foreground-500 mt-0.5">Active automations</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-foreground-950 tabular-nums">{dmsToday}</div>
          <div className="text-xs text-foreground-500 mt-0.5">DMs sent today</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-foreground-950 tabular-nums">{totalLeads}</div>
          <div className="text-xs text-foreground-500 mt-0.5">
            <Link href="/contacts" className="hover:underline text-primary-600">CRM leads captured</Link>
          </div>
        </Card>
      </div>

      {/* DM chart */}
      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground-950">DMs sent — last 14 days</h2>
            <p className="text-xs text-foreground-500 mt-0.5">{dmsTotal} total across all accounts</p>
          </div>
          <Sparkline data={sparkData} />
        </div>
        {/* Full bar chart */}
        <div className="flex items-end gap-1 h-16">
          {sparkData.map((v, i) => {
            const max = Math.max(...sparkData, 1);
            const pct = (v / max) * 100;
            const d = new Date(now.getTime() - (13 - i) * 86_400_000);
            const label = d.toLocaleDateString("en", { month: "short", day: "numeric" });
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative" title={`${label}: ${v} DMs`}>
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${Math.max(pct, 4)}%`,
                    background: v === 0 ? "#e5e7eb" : "var(--color-primary-500, #7c3aed)",
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-1 mt-1">
          {sparkData.map((_, i) => {
            const d = new Date(now.getTime() - (13 - i) * 86_400_000);
            const show = i === 0 || i === 6 || i === 13;
            return (
              <div key={i} className="flex-1 text-center">
                {show && <span className="text-[9px] text-foreground-400">{d.toLocaleDateString("en", { month: "short", day: "numeric" })}</span>}
              </div>
            );
          })}
        </div>
      </Card>

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
            accounts.map((account) => {
              const accountDmsSent = account.automations.reduce((s, a) => s + a.triggerCount, 0);
              const uniqueUsers = account._count.events;
              return (
                <Card key={account.id} className="p-4">
                  {/* Account header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground-950">@{account.username}</span>
                        {account.name && account.name !== account.username && (
                          <span className="text-xs text-foreground-500">{account.name}</span>
                        )}
                        <Badge status={account.active ? "connected" : "pending"} />
                      </div>
                      <p className="text-[11px] text-foreground-400 mt-0.5 font-mono">{account.igUserId}</p>
                      <div className="flex gap-4 mt-2 text-xs text-foreground-500">
                        <span><span className="font-semibold text-foreground-800">{accountDmsSent}</span> DMs sent</span>
                        <span><span className="font-semibold text-foreground-800">{account.automations.length}</span> automations</span>
                        <span><span className="font-semibold text-foreground-800">{uniqueUsers}</span> events</span>
                      </div>
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

                  {/* Automations */}
                  <div className="space-y-2 mb-4">
                    {account.automations.length === 0 ? (
                      <p className="text-xs text-foreground-400 italic py-2">No automations yet</p>
                    ) : (
                      account.automations.map((auto) => {
                        const successRate = auto._count.events > 0
                          ? Math.round((auto.triggerCount / auto._count.events) * 100)
                          : 0;
                        return (
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
                              <div className="flex flex-wrap gap-x-3 mt-1 text-[11px] text-foreground-500">
                                {auto.keyword && (
                                  <span>Keyword: <span className="font-mono text-foreground-700">{auto.keyword}</span></span>
                                )}
                                {auto.postUrl && (
                                  <span>Post: <a href={auto.postUrl} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">specific post ↗</a></span>
                                )}
                                {auto.cooldownHours > 0 && (
                                  <span>Cooldown: {auto.cooldownHours}h</span>
                                )}
                              </div>
                              <p className="text-[11px] text-foreground-500 mt-1 line-clamp-1">DM: {auto.dmMessage}</p>
                              <div className="flex gap-4 mt-1.5 text-[10px] text-foreground-400">
                                <span className="font-semibold text-foreground-700">{auto.triggerCount} triggers</span>
                                <span>{auto._count.events} events</span>
                                {auto._count.events > 0 && <span>{successRate}% delivered</span>}
                              </div>
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
                          {/* Inline edit form */}
                          <details className="mt-2 border-t border-background-200">
                            <summary className="pt-2 text-[11px] text-primary-600 cursor-pointer hover:underline list-none">Edit automation</summary>
                            <form action={updateAutomation.bind(null, auto.id)} className="mt-2 space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <input name="name" required defaultValue={auto.name} placeholder="Automation name" className="col-span-2 w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
                                <select name="trigger" required defaultValue={auto.trigger} className="col-span-2 text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50">
                                  {Object.entries(TRIGGER_LABELS).map(([val, label]) => (
                                    <option key={val} value={val}>{label} — {TRIGGER_DESC[val]}</option>
                                  ))}
                                </select>
                                <input name="keyword" defaultValue={auto.keyword ?? ""} placeholder="Keyword (for keyword triggers)" className="text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
                                <input name="cooldownHours" type="number" min="0" defaultValue={auto.cooldownHours} placeholder="Cooldown hours" className="text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
                              </div>
                              <textarea name="dmMessage" required rows={3} defaultValue={auto.dmMessage} placeholder="DM message… use {username} for their handle" className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50 resize-none" />
                              <input name="publicReply" defaultValue={auto.publicReply ?? ""} placeholder='Public comment reply (optional, e.g. "Sent you a DM! 📥")' className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
                              <input name="postUrl" defaultValue={auto.postUrl ?? ""} placeholder="Specific post URL (optional — leave blank to fire on all posts)" className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
                              <button className="w-full text-xs bg-foreground-900 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-foreground-700">
                                Save changes
                              </button>
                            </form>
                          </details>
                        );
                      })
                    )}
                  </div>

                  {/* Add automation */}
                  <details className="border border-dashed border-background-300 rounded-lg">
                    <summary className="px-3 py-2 text-xs font-medium text-foreground-600 cursor-pointer hover:bg-background-50 rounded-lg list-none flex items-center gap-1.5">
                      <i className="ri-add-line" /> Add automation
                    </summary>
                    <form action={createAutomation.bind(null, account.id)} className="p-3 space-y-2 border-t border-background-200">
                      <div className="grid grid-cols-2 gap-2">
                        <input name="name" required placeholder="Automation name" className="col-span-2 w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
                        <select name="trigger" required className="col-span-2 text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50">
                          {Object.entries(TRIGGER_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label} — {TRIGGER_DESC[val]}</option>
                          ))}
                        </select>
                        <input name="keyword" placeholder="Keyword (for keyword triggers)" className="text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
                        <input name="cooldownHours" type="number" min="0" defaultValue="24" placeholder="Cooldown hours" className="text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
                      </div>
                      <textarea name="dmMessage" required rows={3} placeholder="DM message… use {username} for their handle" className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50 resize-none" />
                      <input name="publicReply" placeholder='Public comment reply (optional, e.g. "Sent you a DM! 📥")' className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
                      <input name="postUrl" placeholder="Specific post URL (optional — leave blank to fire on all posts)" className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50" />
                      <button className="w-full text-xs bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                        Create automation
                      </button>
                    </form>
                  </details>
                </Card>
              );
            })
          )}

          {/* Event log */}
          {recentEvents.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground-950">Recent triggers</h2>
                <Link href="/contacts?source=instagram" className="text-xs text-primary-600 hover:underline">
                  View captured leads →
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b border-background-200 text-foreground-500">
                      <th className="py-2 px-2 font-medium">Account</th>
                      <th className="py-2 px-2 font-medium">User</th>
                      <th className="py-2 px-2 font-medium">Automation</th>
                      <th className="py-2 px-2 font-medium">Type</th>
                      <th className="py-2 px-2 font-medium">Comment / text</th>
                      <th className="py-2 px-2 font-medium">DM</th>
                      <th className="py-2 px-2 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEvents.map((ev) => (
                      <tr key={ev.id} className="border-b border-background-100 last:border-0 hover:bg-background-50">
                        <td className="py-2 px-2 text-foreground-600">@{ev.account.username}</td>
                        <td className="py-2 px-2 font-mono text-foreground-600">
                          {ev.igUsername ? `@${ev.igUsername}` : ev.fromIgUserId.slice(0, 10) + "…"}
                        </td>
                        <td className="py-2 px-2 text-foreground-600">{ev.automation?.name ?? "—"}</td>
                        <td className="py-2 px-2">
                          <span className="bg-primary-50 text-primary-700 rounded px-1.5 py-0.5 text-[10px] font-medium">
                            {TRIGGER_LABELS[ev.triggerType]}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-foreground-500 max-w-[160px] truncate">{ev.commentText ?? "—"}</td>
                        <td className="py-2 px-2">
                          {ev.dmSent ? (
                            <span className="text-green-600 font-medium">✓ Sent</span>
                          ) : (
                            <span className="text-red-500 text-[11px]" title={ev.dmError ?? "Failed"}>✗ Failed</span>
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
              Paste your Instagram Login API token (<code className="font-mono bg-background-100 px-1 rounded text-[10px]">IGAAPT…</code>). The Account ID is auto-detected from the token.
            </p>
            <form action={connectInstagramAccount} className="space-y-2">
              <input name="accessToken" required placeholder="Instagram access token (IGAAPT…)" className="w-full text-xs border border-background-300 rounded px-2.5 py-1.5 bg-background-50 font-mono" />
              <button className="w-full text-xs bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
                Verify & connect
              </button>
            </form>
          </Card>

          {/* Webhook info */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-2">Meta webhook</h2>
            <p className="text-xs text-foreground-500 mb-3">
              In Meta App → Webhooks → Instagram, subscribe to <strong>comments</strong> and <strong>messages</strong>.
            </p>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] text-foreground-400 mb-1 font-semibold uppercase tracking-wide">Callback URL</p>
                <p className="text-[11px] font-mono bg-background-100 rounded px-2 py-1.5 break-all select-all text-foreground-700">{webhookUrl}</p>
              </div>
              <div>
                <p className="text-[10px] text-foreground-400 mb-1 font-semibold uppercase tracking-wide">Verify Token</p>
                <p className="text-[11px] font-mono bg-background-100 rounded px-2 py-1.5 break-all select-all text-foreground-700">{verifyToken}</p>
              </div>
            </div>
          </Card>

          {/* Variables reference */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-2">Message variables</h2>
            <div className="space-y-1">
              {[
                ["{username}", "Their Instagram username"],
              ].map(([v, desc]) => (
                <div key={v} className="flex items-start gap-2">
                  <code className="text-[11px] font-mono bg-background-100 rounded px-1.5 py-0.5 shrink-0 text-primary-700">{v}</code>
                  <span className="text-xs text-foreground-500">{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-foreground-400 mt-3">
              Example: <em>"Hey {"{username}"}, welcome! We make peptide research compounds…"</em>
            </p>
            <p className="text-[11px] text-foreground-400 mt-1">
              <strong>Welcome DM</strong> doesn't need a keyword — leave it blank.
            </p>
          </Card>

          {/* How it works */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground-950 mb-2">How it works</h2>
            <ol className="text-xs text-foreground-600 space-y-1.5 list-decimal list-inside">
              <li>Connect an Instagram Business account</li>
              <li>Create an automation with a keyword trigger</li>
              <li>Tell your audience to comment the keyword</li>
              <li>They get an instant DM + are captured as a CRM lead</li>
              <li>Optional: limit to one specific post/reel</li>
              <li>Cooldown prevents the same person getting repeat DMs</li>
            </ol>
            <p className="text-[11px] text-foreground-400 mt-3">
              Requires{" "}
              <a href="https://developers.facebook.com/docs/instagram-api/reference/ig-user/messages" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
                Meta App Review ↗
              </a>{" "}
              for live production use.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
