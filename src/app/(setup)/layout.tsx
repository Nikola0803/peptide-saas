import Link from "next/link";

// Pages that must work BEFORE a user has finished 2FA enrollment live in this
// route group, outside the (app) layout. The (app) layout calls requireOrg(),
// which redirects un-enrolled users to /settings/security. When that page sat
// inside (app) too, the client router reused the redirecting layout and
// looped ("Maximum update depth exceeded"), leaving a blank page.
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background-100">
      <header className="border-b border-background-200 bg-background-50">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground-950">EVLV Command Center</span>
          <Link href="/dashboard" className="text-xs font-medium text-foreground-600 hover:text-foreground-900">
            Back to dashboard
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
