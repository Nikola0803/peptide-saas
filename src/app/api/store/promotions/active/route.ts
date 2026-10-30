import { NextRequest, NextResponse } from "next/server";
import { resolveHeaderOverride } from "@/lib/store-context";
import { prisma } from "@/lib/prisma";
import { evlvHalloweenPromotionOptions, halloweenPromotionIsLive } from "@/lib/halloween-bogo-promotion";

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
      domain: true,
    },
  });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  const halloween = evlvHalloweenPromotionOptions({
    active: brand.halloweenBogoActive,
    startsAt: brand.halloweenStartsAt,
    endsAt: brand.halloweenEndsAt,
    brandDomain: brand.domain,
  });
  const live = halloweenPromotionIsLive(halloween);

  return NextResponse.json({
    halloween: {
      live,
      themeActive: live && Boolean(halloween.forceLiveFromCode || brand?.halloweenThemeActive),
      startsAt: halloween.startsAt?.toISOString() ?? null,
      endsAt: halloween.endsAt?.toISOString() ?? null,
      freeShippingThresholdCents: brand?.halloweenFreeShippingCents ?? 30000,
      promotionId: "HALLOWEEN_BOGO_2026",
      headline: "Buy one, get one free",
      detail: "Mix any two vials: the lower-priced one in each pair is free. No pair limit.",
    },
  });
}
