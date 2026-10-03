import { NextResponse } from "next/server";

export async function GET() {
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublic) {
    return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });
  }
  return NextResponse.json({ publicKey: vapidPublic });
}
