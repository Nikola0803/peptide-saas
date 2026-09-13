import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { utcDateString } from "@/lib/order-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/store/giveaway/enter — the free, no-purchase-necessary entry
// path. Every giveaway this CRM runs must offer one of these (see
// GiveawayConfig.rulesText's doc comment): a purchase-only sweepstakes
// with no free alternate entry is an unlawful lottery in most US states.
// One entry per email per day, same as a purchase entry isn't deduped
// (multiple qualifying orders can each add a ticket) — free entries are
// deliberately capped at one/day so this can't be used to spam entries.
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const config = await prisma.giveawayConfig.findUnique({ where: { brandId: store.brandId } });
  if (!config || !config.enabled) {
    return NextResponse.json({ error: "No giveaway is running right now." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const today = utcDateString();
  const existing = await prisma.giveawayEntry.findFirst({
    where: { brandId: store.brandId, email, entryDate: today, method: "FREE" },
  });
  if (existing) {
    return NextResponse.json({ ok: true, alreadyEntered: true });
  }

  await prisma.giveawayEntry.create({
    data: { brandId: store.brandId, email, method: "FREE", entryDate: today },
  });

  return NextResponse.json({ ok: true, alreadyEntered: false });
}
