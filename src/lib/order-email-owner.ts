// Who sends EVLV's customer-facing order emails: the CRM (Resend) or
// Omnisend. Set ORDER_EMAILS_VIA=omnisend once the Omnisend order
// confirmation / payment confirmed / shipping flows are switched on, and
// the CRM stops sending its own copies so customers never get two.
//
// Only EVLV orders move: the Omnisend account is EVLV's, and other
// storefronts on this CRM (ZooNetics) still need the CRM's emails.
// Office / fulfillment notifications always stay on the CRM.
import { isEvlvBrandId } from "@/lib/omnisend-order-sync";

export function omnisendOwnsEvlvOrderEmails(): boolean {
  return (process.env.ORDER_EMAILS_VIA ?? "").trim().toLowerCase() === "omnisend";
}

export async function crmSkipsCustomerOrderEmail(brandId: string | null | undefined): Promise<boolean> {
  if (!omnisendOwnsEvlvOrderEmails() || !brandId) return false;
  return isEvlvBrandId(brandId);
}
