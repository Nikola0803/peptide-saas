"use client";

import { useState } from "react";
import QRCode from "qrcode";

type Props = {
  affiliateName: string;
  affiliateCode: string;
  referralUrl: string;
};

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "affiliate";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export function AffiliateQrCode({ affiliateName, affiliateCode, referralUrl }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (dataUrl || working) return;
    setWorking(true);
    try {
      setDataUrl(await QRCode.toDataURL(referralUrl, {
        errorCorrectionLevel: "H",
        margin: 4,
        width: 1200,
        color: { dark: "#111827", light: "#ffffff" },
      }));
    } finally {
      setWorking(false);
    }
  }

  function download() {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `evlv-${safeFilename(affiliateName)}-${safeFilename(affiliateCode)}-qr.png`;
    link.click();
  }

  function print() {
    if (!dataUrl) return;
    const printWindow = window.open("", "_blank", "width=720,height=860");
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><title>EVLV affiliate QR</title><style>
      @page{size:auto;margin:18mm}body{font-family:Arial,sans-serif;text-align:center;color:#111827;margin:0}
      .sheet{display:flex;min-height:90vh;flex-direction:column;align-items:center;justify-content:center}
      img{width:4.5in;height:4.5in;image-rendering:crisp-edges}.brand{font-size:14px;font-weight:800;letter-spacing:.18em}
      h1{font-size:24px;margin:16px 0 6px}.code{font:700 18px monospace;margin:0 0 12px}.url{font:12px monospace;word-break:break-all}
    </style></head><body><div class="sheet"><div class="brand">EVLV</div><h1>${escapeHtml(affiliateName)}</h1><div class="code">${escapeHtml(affiliateCode)}</div><img src="${dataUrl}" alt="Affiliate QR code"><div class="url">${escapeHtml(referralUrl)}</div></div><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
    printWindow.document.close();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={generate} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-primary-300 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-800 hover:bg-primary-100">
        <i className="ri-qr-code-line" /> {open ? "Hide QR code" : "Generate QR code"}
      </button>
      {open && (
        <div className="mt-3 rounded-lg border border-background-300 bg-white p-3 text-center">
          {working && <div className="flex h-48 items-center justify-center text-xs text-foreground-500">Generating print-quality QR…</div>}
          {dataUrl && <img src={dataUrl} alt={`Referral QR code for ${affiliateName}`} className="mx-auto h-48 w-48" />}
          <p className="mt-2 break-all font-mono text-[10px] text-foreground-500">{referralUrl}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button type="button" onClick={download} disabled={!dataUrl} className="rounded border border-background-300 px-2 py-1.5 text-[11px] font-medium disabled:opacity-40"><i className="ri-download-line" /> PNG</button>
            <button type="button" onClick={print} disabled={!dataUrl} className="rounded border border-background-300 px-2 py-1.5 text-[11px] font-medium disabled:opacity-40"><i className="ri-printer-line" /> Print</button>
            <button type="button" onClick={copyLink} className="rounded border border-background-300 px-2 py-1.5 text-[11px] font-medium"><i className="ri-file-copy-line" /> {copied ? "Copied" : "Link"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
