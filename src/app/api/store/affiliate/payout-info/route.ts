import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveHeaderOverride } from "@/lib/store-context";
import { resolveContactFromToken } from "@/lib/store-customer";
import { payoutMethodFromWire, bankAccountTypeFromWire, payoutMethodToWire, bankAccountTypeToWire } from "@/lib/affiliate-wire";

const bodySchema = z
  .object({
    token: z.string().optional(),
    payoutMethod: z.enum(["venmo", "zelle", "cashapp", "bank_ach"]),
    payoutDestination: z.string().optional(),
    bankAccountHolder: z.string().optional(),
    bankRoutingNumber: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankAccountType: z.enum(["checking", "savings"]).optional(),
  })
  .refine((v) => (v.payoutMethod === "bank_ach" ? Boolean(v.bankAccountHolder && v.bankRoutingNumber && v.bankAccountNumber && v.bankAccountType) : true), {
    message: "Bank account details are required for ACH payouts",
  })
  .refine((v) => (v.payoutMethod !== "bank_ach" ? Boolean(v.payoutDestination) : true), {
    message: "A payout destination is required for this method",
  });

// POST /api/store/affiliate/payout-info { token, payoutMethod, ... }
export async function POST(req: NextRequest) {
  const store = await resolveHeaderOverride(req);
  if (!store) {
    return NextResponse.json({ error: "Unknown or unauthorized store" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const contact = await resolveContactFromToken(req, store, raw);
  if (!contact) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const affiliate = await prisma.affiliate.findUnique({ where: { contactId: contact.id } });
  if (!affiliate || affiliate.status !== "APPROVED") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const isAch = parsed.data.payoutMethod === "bank_ach";
  const updated = await prisma.affiliate.update({
    where: { id: affiliate.id },
    data: {
      payoutMethod: payoutMethodFromWire(parsed.data.payoutMethod),
      payoutDestination: isAch ? null : parsed.data.payoutDestination || null,
      bankAccountHolder: isAch ? parsed.data.bankAccountHolder || null : null,
      bankRoutingNumber: isAch ? parsed.data.bankRoutingNumber || null : null,
      bankAccountNumber: isAch ? parsed.data.bankAccountNumber || null : null,
      bankAccountType: isAch ? bankAccountTypeFromWire(parsed.data.bankAccountType) : null,
    },
  });

  return NextResponse.json({
    payoutMethod: payoutMethodToWire(updated.payoutMethod),
    payoutDestination: updated.payoutDestination,
    bankAccountHolder: updated.bankAccountHolder,
    bankRoutingNumber: updated.bankRoutingNumber,
    bankAccountNumber: updated.bankAccountNumber,
    bankAccountType: bankAccountTypeToWire(updated.bankAccountType),
  });
}
