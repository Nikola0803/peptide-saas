import type { Metadata } from "next";

export const metadata: Metadata = { title: "Access revoked", robots: { index: false, follow: false } };

// Shown for switched-off modules (dropship / wholesale) and revoked logins.
// Edit BLOCK_MESSAGE to change the wording.
const BLOCK_TITLE = "Access revoked";
const BLOCK_MESSAGE =
  "Your access has been permanently revoked. EVLV's CRM and website code is licensed software; any unlicensed use will be handled by our lawyer.";

export default function BlockedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background-100 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-foreground-950">{BLOCK_TITLE}</h1>
        <p className="mt-3 text-sm text-foreground-500">{BLOCK_MESSAGE}</p>
      </div>
    </div>
  );
}
