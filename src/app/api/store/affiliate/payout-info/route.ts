import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { bearerToken, verifyAffiliateToken } from "@/lib/affiliate-auth";

const bodySchema = z
  .object({
    token: z.string().optional(),
    payoutMethod: z.enum(["VENMO", "ZELLE", "CASHAPP", "BANK_ACH"]),
    payoutDestination: z.string().optional(),
    bankAccountHolder: z.string().optional(),
    bankRoutingNumber: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankAccountType: z.enum(["CHECKING", "SAVINGS"]).optional(),
  })
  .refine((v) => (v.payoutMethod === "BANK_ACH" ? Boolean(v.bankAccountHolder && v.bankRoutingNumber && v.bankAccountNumber && v.bankAccountType) : true), {
    message: "Bank account details are required for ACH payouts",
  })
  .refine((v) => (v.payoutMethod !== "BANK_ACH" ? Boolean(v.payoutDestination) : true), {
    message: "A payout destination is required for this method",
  });

// POST /api/store/affiliate/payout-info { token, payoutMethod, ... }
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const claims = verifyAffiliateToken(bearerToken(req) ?? raw?.token);
  if (!claims || claims.organizationId !== store.organizationId) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const affiliate = await prisma.affiliate.update({
    where: { id: claims.affiliateId },
    data: {
      payoutMethod: parsed.data.payoutMethod,
      payoutDestination: parsed.data.payoutMethod === "BANK_ACH" ? null : parsed.data.payoutDestination || null,
      bankAccountHolder: parsed.data.payoutMethod === "BANK_ACH" ? parsed.data.bankAccountHolder || null : null,
      bankRoutingNumber: parsed.data.payoutMethod === "BANK_ACH" ? parsed.data.bankRoutingNumber || null : null,
      bankAccountNumber: parsed.data.payoutMethod === "BANK_ACH" ? parsed.data.bankAccountNumber || null : null,
      bankAccountType: parsed.data.payoutMethod === "BANK_ACH" ? parsed.data.bankAccountType || null : null,
    },
  });

  return NextResponse.json({
    payoutMethod: affiliate.payoutMethod,
    payoutDestination: affiliate.payoutDestination,
    bankAccountHolder: affiliate.bankAccountHolder,
    bankRoutingNumber: affiliate.bankRoutingNumber,
    bankAccountNumber: affiliate.bankAccountNumber,
    bankAccountType: affiliate.bankAccountType,
  });
}
