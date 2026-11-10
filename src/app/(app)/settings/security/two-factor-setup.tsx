"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";

type Phase = "idle" | "setup" | "confirm" | "recovery" | "disable";

interface Props {
  totpEnabled: boolean;
  totpVerifiedAt: string | null;
  recoveryCodesRemaining: number;
}

export function TwoFactorSetup({ totpEnabled, totpVerifiedAt, recoveryCodesRemaining }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const isRequired = params.get("setup") === "required";

  const [phase, setPhase] = useState<Phase>("idle");
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copiedRecovery, setCopiedRecovery] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableTotp, setDisableTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startSetup() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/setup");
      if (!res.ok) throw new Error("Failed to generate setup code");
      const data = await res.json();
      setQrDataUri(data.qrDataUri);
      setPhase("setup");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function confirmSetup() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invalid code");
        return;
      }
      setRecoveryCodes(data.recoveryCodes);
      setCode("");
      setPhase("recovery");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function finishSetup() {
    // Refresh session so totpEnabled is reflected in the JWT, then continue
    await signOut({ redirect: false });
    router.push("/login");
  }

  async function confirmDisable() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword, totp: disableTotp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to disable 2FA");
        return;
      }
      setPhase("idle");
      setDisablePassword("");
      setDisableTotp("");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function copyRecoveryCodes() {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopiedRecovery(true);
    setTimeout(() => setCopiedRecovery(false), 2000);
  }

  return (
    <div className="bg-background-50 border border-background-200 rounded-lg p-6 space-y-6">
      {isRequired && !totpEnabled && phase === "idle" && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm text-amber-800">
          <strong>2FA required.</strong> You must set up two-factor authentication before accessing the CRM.
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground-900">Two-factor authentication</span>
            {totpEnabled ? (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700">Enabled</span>
            ) : (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-background-200 text-foreground-600">Disabled</span>
            )}
          </div>
          <p className="text-xs text-foreground-500 mt-1">
            {totpEnabled
              ? `Active since ${totpVerifiedAt ? new Date(totpVerifiedAt).toLocaleDateString() : "unknown"} · ${recoveryCodesRemaining} recovery code${recoveryCodesRemaining !== 1 ? "s" : ""} remaining`
              : "Protect your account with a time-based one-time password from an authenticator app."}
          </p>
        </div>

        {phase === "idle" && !totpEnabled && (
          <button
            onClick={startSetup}
            disabled={loading}
            className="shrink-0 rounded-md bg-primary-500 text-background-50 text-xs font-medium px-3 py-1.5 hover:bg-primary-600 transition-colors disabled:opacity-60"
          >
            Set up
          </button>
        )}

        {phase === "idle" && totpEnabled && (
          <button
            onClick={() => { setPhase("disable"); setError(null); }}
            className="shrink-0 rounded-md border border-accent-300 text-accent-700 text-xs font-medium px-3 py-1.5 hover:bg-accent-50 transition-colors"
          >
            Disable
          </button>
        )}
      </div>

      {/* ── SETUP: scan QR ── */}
      {phase === "setup" && qrDataUri && (
        <div className="space-y-4">
          <hr className="border-background-200" />
          <div>
            <p className="text-sm font-medium text-foreground-900 mb-1">Step 1 — Scan this QR code</p>
            <p className="text-xs text-foreground-500 mb-3">
              Open Google Authenticator, Authy, or any TOTP app and scan the code below.
            </p>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUri} alt="TOTP QR code" className="rounded-lg border border-background-200" width={200} height={200} />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground-900 mb-1">Step 2 — Enter the code from the app</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                className="flex-1 rounded-md border border-background-300 bg-background-50 px-3 py-2 text-sm text-foreground-950 font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={confirmSetup}
                disabled={loading || code.length < 6}
                className="rounded-md bg-primary-500 text-background-50 text-sm font-medium px-4 py-2 hover:bg-primary-600 transition-colors disabled:opacity-60"
              >
                {loading ? "Verifying…" : "Verify"}
              </button>
            </div>
          </div>

          {error && <div className="text-xs text-accent-700">{error}</div>}
        </div>
      )}

      {/* ── RECOVERY CODES ── */}
      {phase === "recovery" && (
        <div className="space-y-4">
          <hr className="border-background-200" />
          <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
            <p className="text-sm font-semibold text-amber-900 mb-1">Save your recovery codes</p>
            <p className="text-xs text-amber-800">
              These are shown <strong>once only</strong>. If you lose your authenticator app, use one of these codes to sign in. Each code works once.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-background-100 rounded-lg p-4">
            {recoveryCodes.map((c) => (
              <span key={c} className="text-foreground-800 tracking-wider">{c}</span>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyRecoveryCodes}
              className="flex-1 rounded-md border border-background-300 text-foreground-700 text-xs font-medium px-3 py-1.5 hover:bg-background-100 transition-colors"
            >
              {copiedRecovery ? "Copied!" : "Copy all"}
            </button>
            <button
              onClick={finishSetup}
              className="flex-1 rounded-md bg-primary-500 text-background-50 text-xs font-medium px-3 py-1.5 hover:bg-primary-600 transition-colors"
            >
              I&apos;ve saved them — sign in again
            </button>
          </div>
        </div>
      )}

      {/* ── DISABLE ── */}
      {phase === "disable" && (
        <div className="space-y-4">
          <hr className="border-background-200" />
          <div className="bg-accent-50 border border-accent-200 rounded-md px-4 py-3 text-xs text-accent-800">
            To disable 2FA, confirm your password and enter your current authenticator code.
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="Your password"
              className="w-full rounded-md border border-background-300 bg-background-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="text"
              value={disableTotp}
              onChange={(e) => setDisableTotp(e.target.value)}
              placeholder="6-digit authenticator code"
              maxLength={6}
              inputMode="numeric"
              className="w-full rounded-md border border-background-300 bg-background-50 px-3 py-2 text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          {error && <div className="text-xs text-accent-700">{error}</div>}
          <div className="flex gap-2">
            <button
              onClick={() => { setPhase("idle"); setError(null); }}
              className="flex-1 rounded-md border border-background-300 text-foreground-700 text-xs font-medium px-3 py-1.5 hover:bg-background-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDisable}
              disabled={loading || !disablePassword || disableTotp.length < 6}
              className="flex-1 rounded-md bg-accent-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-accent-700 transition-colors disabled:opacity-60"
            >
              {loading ? "Disabling…" : "Disable 2FA"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
