import { NextRequest, NextResponse } from "next/server";
import { resolveHeaderOverride } from "@/lib/store-context";
import { prisma } from "@/lib/prisma";
import { halloweenPromotionIsLive } from "@/lib/halloween-bogo-promotion";

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
    },
  });
  const live = Boolean(brand && halloweenPromotionIsLive({
    active: brand.halloweenBogoActive,
    startsAt: brand.halloweenStartsAt,
    endsAt: brand.halloweenEndsAt,
  }));

  return NextResponse.json({
    halloween: {
      live,
      themeActive: live && Boolean(brand?.halloweenThemeActive),
      startsAt: brand?.halloweenStartsAt?.toISOString() ?? null,
      endsAt: brand?.halloweenEndsAt?.toISOString() ?? null,
      freeShippingThresholdCents: brand?.halloweenFreeShippingCents ?? 30000,
      promotionId: "HALLOWEEN_BOGO_2026",
      headline: "Buy one, get one free",
      detail: "Every second matching product and strength is free. No pair limit.",
    },
  });
}
