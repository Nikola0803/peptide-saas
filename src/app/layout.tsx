import type { Metadata } from "next";
import "remixicon/fonts/remixicon.css";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Peptide Command Center — Multi-Brand CRM",
  description:
    "Centralized eCommerce command center for a multi-brand research peptide network. Unified orders, contacts, master inventory, and affiliates across all storefronts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
