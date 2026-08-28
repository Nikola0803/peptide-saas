// e.g. "JORDAN4F2A" -- first name (or "AFF" if none given) plus 4 random
// alphanumerics, re-rolled on collision. Doubles as both slug and
// couponCode. (Affiliate accounts authenticate via the shopper's own
// customer session token now -- see AFFILIATE-PORTAL.md and
// src/lib/store-customer.ts -- this is the only piece of the original
// standalone-login design still in use.)
export async function generateAffiliateCode(
  firstName: string | undefined,
  isTaken: (code: string) => Promise<boolean>
): Promise<string> {
  const base = (firstName || "AFF").replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 12) || "AFF";
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt++) {
    let suffix = "";
    for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    const code = `${base}${suffix}`;
    if (!(await isTaken(code))) return code;
  }
  throw new Error("Could not generate a unique affiliate code");
}
