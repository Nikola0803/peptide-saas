import type { Metadata, Viewport } from "next";
import "remixicon/fonts/remixicon.css";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Peptide Command Center — Multi-Brand CRM",
  description:
    "Centralized eCommerce command center for a multi-brand research peptide network. Unified orders, contacts, master inventory, and affiliates across all storefronts.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EVLV CRM",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b2f2c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
