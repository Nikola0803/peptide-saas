import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAndFetchAccount, subscribeAccountToWebhooks } from "@/lib/instagram";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXTAUTH_URL ?? `https://${req.headers.get("host")}`;

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/instagram?error=instagram_denied`);
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.redirect(`${appUrl}/instagram?error=not_configured`);
  }

  const redirectUri = `${appUrl}/api/instagram/callback`;

  try {
    // Exchange code for short-lived token
    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error_message?: string };
    if (!tokenData.access_token) throw new Error(tokenData.error_message ?? "Token exchange failed");

    // Exchange for long-lived token (IGAAPT format, 60-day expiry)
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_id=${appId}&client_secret=${appSecret}&access_token=${tokenData.access_token}`
    );
    const longData = await longRes.json() as { access_token?: string; error?: { message: string } };
    if (!longData.access_token) throw new Error(longData.error?.message ?? "Long-lived token exchange failed");

    const accessToken = longData.access_token;
    const info = await verifyAndFetchAccount(accessToken);
    const igUserId = info.id;

    // Get org from session
    const user = await prisma.user.findUnique({
      where: { email: session.user?.email ?? "" },
      include: { memberships: { include: { organization: true }, take: 1 } },
    });
    const organization = user?.memberships[0]?.organization;
    if (!organization) throw new Error("No organization found");

    await prisma.instagramAccount.upsert({
      where: { igUserId },
      update: { accessToken, username: info.username, name: info.name, active: true, organizationId: organization.id },
      create: {
        organizationId: organization.id,
        igUserId,
        accessToken,
        username: info.username,
        name: info.name,
      },
    });

    try {
      await subscribeAccountToWebhooks(accessToken, igUserId);
    } catch {
      // non-fatal
    }

    return NextResponse.redirect(`${appUrl}/instagram?connected=${info.username}`);
  } catch (err) {
    console.error("[ig-oauth] callback error:", err);
    const msg = err instanceof Error ? encodeURIComponent(err.message) : "unknown";
    return NextResponse.redirect(`${appUrl}/instagram?error=${msg}`);
  }
}
