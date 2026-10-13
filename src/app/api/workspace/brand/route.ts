import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_BRAND_COOKIE } from "@/lib/active-brand";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const organizationId = (session?.user as any)?.organizationId as string | undefined;
  if (!organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await req.json().catch(() => ({ brandId: "" }));
  if (brandId !== "all") {
    const brand = await prisma.brand.findFirst({ where: { id: brandId, organizationId } });
    if (!brand) return NextResponse.json({ error: "Unknown brand" }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACTIVE_BRAND_COOKIE, brandId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
