"use client";

import { useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

type Step = "credentials" | "totp";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const isBlocked = params.get("blocked") === "1";

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(
    isBlocked ? "Access restricted. Please contact your administrator." : null
  );
  const [loading, setLoading] = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      totp: "",
      redirect: false,
    });

    setLoading(false);

    if (!result?.error) {
      // No 2FA required — session is live
      await finishLogin();
      return;
    }

    if (result.error === "2FA_REQUIRED") {
      setStep("totp");
      return;
    }

    if (result.error === "TOO_MANY_ATTEMPTS") {
      setError("Too many failed attempts. Please wait 15 minutes and try again.");
      return;
    }

    setError("That email and password don't match an account.");
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      totp: totp.replace(/\s/g, ""),
      redirect: false,
    });

    setLoading(false);

    if (!result?.error) {
      await finishLogin();
      return;
    }

    if (result.error === "INVALID_2FA") {
      setError("Invalid code. Try again or use a recovery code.");
      setTotp("");
      return;
    }

    if (result.error === "TOO_MANY_ATTEMPTS") {
      setError("Too many failed attempts. Please wait 15 minutes and try again.");
      return;
    }

    setError("Authentication failed. Please try again.");
  }

  async function finishLogin() {
    const session = await getSession();
    const role = (session?.user as any)?.role;
    router.push(role === "DROPSHIP_AGENT" ? "/dropship" : "/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-100 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-md bg-primary-500 flex items-center justify-center text-background-50">
            <i className="ri-pulse-line text-lg" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground-950">Command Center</div>
            <div className="text-[11px] text-foreground-500">Multi-Brand CRM</div>
          </div>
        </div>

        {step === "credentials" ? (
          <form
            onSubmit={handleCredentials}
            className="bg-background-50 border border-background-200 rounded-lg p-6 space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-foreground-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-background-300 bg-background-50 px-3 py-2 text-sm text-foreground-950 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-background-300 bg-background-50 px-3 py-2 text-sm text-foreground-950 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="••••••••"
              />
            </div>

            {error && <div className="text-xs text-accent-700">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary-500 text-background-50 text-sm font-medium py-2 hover:bg-primary-600 transition-colors disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>

            <p className="text-[11px] text-foreground-500 text-center">
              Authorized EVLV operations access only. Contact an administrator if you need access.
            </p>
          </form>
        ) : (
          <form
            onSubmit={handleTotp}
            className="bg-background-50 border border-background-200 rounded-lg p-6 space-y-4"
          >
            <div className="text-center space-y-1">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center mx-auto">
                <i className="ri-shield-keyhole-line text-primary-600 text-lg" />
              </div>
              <p className="text-sm font-medium text-foreground-900">Two-factor authentication</p>
              <p className="text-xs text-foreground-500">
                Enter the 6-digit code from your authenticator app, or a recovery code.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground-700 mb-1">
                Authentication code
              </label>
              <input
                type="text"
                required
                autoFocus
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                className="w-full rounded-md border border-background-300 bg-background-50 px-3 py-2 text-sm text-foreground-950 focus:outline-none focus:ring-2 focus:ring-primary-500 text-center tracking-widest font-mono"
                placeholder="000000"
                maxLength={9}
                inputMode="numeric"
              />
            </div>

            {error && <div className="text-xs text-accent-700">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary-500 text-background-50 text-sm font-medium py-2 hover:bg-primary-600 transition-colors disabled:opacity-60"
            >
              {loading ? "Verifying…" : "Verify"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setTotp("");
                setError(null);
              }}
              className="w-full text-xs text-foreground-500 hover:text-foreground-700 transition-colors"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
