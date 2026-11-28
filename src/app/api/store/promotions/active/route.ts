import { NextRequest, NextResponse } from "next/server";
import { brandAllowsSitewideEvents } from "@/lib/store-currency";
import { resolveHeaderOverride } from "@/lib/store-context";
import { prisma } from "@/lib/prisma";
import { evlvHalloweenPromotionOptions, halloweenPromotionIsLive, multiBuyKind } from "@/lib/halloween-bogo-promotion";

export async function GET(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });

  const brand = await prisma.brand.findUnique({
    where: { id: store.brandId },
    select: {
      halloweenBogoActive: true,
      halloweenThemeActive: true,
      halloweenStartsAt: true,
      halloweenEndsAt: true,
      halloweenFreeShippingCents: true,
      slug: true,
      domain: true,
    },
  });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  const halloween = evlvHalloweenPromotionOptions({
    active: brandAllowsSitewideEvents(brand) && brand.halloweenBogoActive,
    startsAt: brand.halloweenStartsAt,
    endsAt: brand.halloweenEndsAt,
    brandDomain: brand.domain,
  });
  const live = halloweenPromotionIsLive(halloween);
  const kind = multiBuyKind(halloween);

  return NextResponse.json({
    halloween: {
      live,
      themeActive: live && Boolean(halloween.forceLiveFromCode || brand?.halloweenThemeActive),
      startsAt: halloween.startsAt?.toISOString() ?? null,
      endsAt: halloween.endsAt?.toISOString() ?? null,
      freeShippingThresholdCents: brand?.halloweenFreeShippingCents ?? 30000,
      promotionId: "HALLOWEEN_BOGO_2026",
      kind,
      b2g1StartsAt: halloween.b2g1From?.toISOString() ?? null,
      headline: kind === "b2g1" ? "Buy 2, get 1 free" : "Buy one, get one free",
      detail: kind === "b2g1"
        ? "Mix any single vials: the cheapest of every 3 is free. No limit."
        : "Mix any vials: the cheapest half of your vials is free. No pair limit.",
    },
  });
}
