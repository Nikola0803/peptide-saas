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

async function pushNotify(opts: { title: string; message: string; tags?: string; priority?: string; click?: string; actions?: string }): Promise<void> {
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
    // ntfy action buttons, e.g. "http, Approve, https://..., method=POST, clear=true"
    if (opts.actions) headers.Actions = opts.actions;
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
// membership, verification) already has its own admin
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

// approveUrl: signed one-tap approve link (src/lib/affiliate-approval.ts).
// The push gets an "Approve" button that POSTs to it straight from the
// notification, plus a "Review" button that opens the CRM profile.
export async function pushNotifyAffiliateApplication(input: { affiliateId: string; name: string; email: string; socialLink?: string | null; approveUrl?: string }): Promise<void> {
  const base = getBaseUrl();
  const profileUrl = base ? `${base}/affiliates/${input.affiliateId}` : undefined;
  const actions = [
    input.approveUrl ? `http, Approve 15%, ${input.approveUrl}, method=POST, clear=true` : "",
    profileUrl ? `view, Review, ${profileUrl}` : "",
  ].filter(Boolean).join("; ");
  await pushNotify({
    title: "New partner application",
    message: `${input.name} — ${input.email}${input.socialLink ? ` — ${input.socialLink}` : ""}\nTap Approve to give them partner access now.`,
    tags: "handshake",
    priority: "high",
    click: profileUrl,
    actions: actions || undefined,
  });
}

export async function pushNotifyWholesaleInquiry(input: { companyName: string; contactName: string; email: string; programType: string }): Promise<void> {
  const base = getBaseUrl();
  await pushNotify({
    title: `New ${input.programType} inquiry`,
    message: `${input.companyName} — ${input.contactName} — ${input.email}`,
    tags: "briefcase",
    priority: "high",
    click: base ? `${base}/wholesale` : undefined,
  });
}

export async function pushNotifyHeroesDiscountRequest(input: { name: string; email: string; status: string; branch: string }): Promise<void> {
  const base = getBaseUrl();
  await pushNotify({
    title: "New heroes discount application",
    message: `${input.name} — ${input.email} — ${input.status}, ${input.branch}`,
    tags: "medal_military",
    priority: "high",
    click: base ? `${base}/heroes-discount` : undefined,
  });
}
