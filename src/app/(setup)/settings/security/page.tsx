import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { TwoFactorSetup } from "./two-factor-setup";

export default async function SecuritySettingsPage() {
  // requireSession() not requireOrg() — this page is accessible DURING 2FA setup.
  const { session } = await requireSession();
  const userId = (session.user as any)?.id as string;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabled: true, totpVerifiedAt: true },
  });

  const recoveryCodesRemaining = user?.totpEnabled
    ? await prisma.totpRecoveryCode.count({ where: { userId, usedAt: null } })
    : 0;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-foreground-950">Security</h1>
        <p className="text-sm text-foreground-500 mt-0.5">
          Two-factor authentication and account security settings.
        </p>
      </div>

      <TwoFactorSetup
        totpEnabled={user?.totpEnabled ?? false}
        totpVerifiedAt={user?.totpVerifiedAt?.toISOString() ?? null}
        recoveryCodesRemaining={recoveryCodesRemaining}
      />
    </div>
  );
}
