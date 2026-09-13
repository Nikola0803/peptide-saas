import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { utcDateString } from "@/lib/order-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/store/giveaway — today's giveaway status for this brand (or
// enabled:false if none is running). Real entry count, not a made-up
// number: every PURCHASE entry is created by order-engine.ts when a real
// order clears the threshold, every FREE entry by this route's POST
// handler (see /giveaway/enter), both scoped to today's utcDateString().
export async function GET(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const config = await prisma.giveawayConfig.findUnique({ where: { brandId: store.brandId } });
  if (!config || !config.enabled) {
    return NextResponse.json({ enabled: false });
  }

  const today = utcDateString();
  const entryCount = await prisma.giveawayEntry.count({ where: { brandId: store.brandId, entryDate: today } });

  return NextResponse.json({
    enabled: true,
    prizeLabel: config.prizeLabel,
    minOrderCents: config.minOrderCents,
    rulesText: config.rulesText ?? undefined,
    entryCount,
  });
}
