import { getBaseUrl } from "@/lib/base-url";

// Phone push notifications for new orders, via ntfy.sh -- a free public
// pub/sub broker with no account/API key needed. NTFY_TOPIC just needs to
// be a hard-to-guess string (treat it like a password: anyone who knows it
// can publish to it or read your notifications), set once in .env, and
// subscribed to from the ntfy app (iOS/Android/web) on your phone.
// Best-effort: a failed push never blocks or fails order placement.
const NTFY_TOPIC = process.env.NTFY_TOPIC;
const NTFY_BASE_URL = process.env.NTFY_BASE_URL || "https://ntfy.sh";

export function pushNotifyConfigured(): boolean {
  return Boolean(NTFY_TOPIC);
}

async function pushNotify(opts: { title: string; message: string; tags?: string; priority?: string; click?: string }): Promise<void> {
  if (!NTFY_TOPIC) {
    console.warn(`[push-notify] NTFY_TOPIC not set — skipped push "${opts.title}"`);
    return;
  }
  try {
    const headers: Record<string, string> = {
      Title: opts.title,
      Priority: opts.priority ?? "default",
    };
    if (opts.tags) headers.Tags = opts.tags;
    if (opts.click) headers.Click = opts.click;
    await fetch(`${NTFY_BASE_URL}/${NTFY_TOPIC}`, { method: "POST", headers, body: opts.message });
  } catch (err) {
    console.error("[push-notify] failed to send", err);
  }
}

export async function pushNotifyNewOrder(input: { orderNumber: string; customerName: string; totalFormatted: string; itemCount: number }): Promise<void> {
  await pushNotify({
    title: `New order ${input.orderNumber}`,
    message: `${input.customerName} — ${input.totalFormatted} (${input.itemCount} item${input.itemCount === 1 ? "" : "s"})`,
    tags: "moneybag",
    priority: "high",
  });
}

// The two highest-priority alert types (per the person running this CRM):
// sales, then contact-form leads. Everything else (wholesale, affiliate,
// heroes discount, membership, verification) already has its own admin
// page a staff member checks periodically -- not worth buzzing a phone for.
export async function pushNotifyContactForm(input: { name: string; email: string; subject?: string; preview: string; conversationId: string }): Promise<void> {
  const base = getBaseUrl();
  await pushNotify({
    title: `New contact form message${input.subject ? `: ${input.subject}` : ""}`,
    message: `${input.name || input.email || "Unknown"} — ${input.preview.slice(0, 200)}`,
    tags: "speech_balloon",
    priority: "high",
    click: base ? `${base}/support/${input.conversationId}` : undefined,
  });
}
