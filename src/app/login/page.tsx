"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("That email and password don't match an account.");
      return;
    }
    router.push("/dashboard");
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

        <form
          onSubmit={handleSubmit}
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
            Seeded demo login: <span className="font-mono">operator@example.com</span> /{" "}
            <span className="font-mono">password123</span>
          </p>
        </form>
      </div>
    </div>
  );
}
