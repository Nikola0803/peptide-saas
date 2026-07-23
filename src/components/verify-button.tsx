"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { VerifyState } from "@/app/(app)/webhooks/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs bg-primary-500 text-background-50 rounded px-2.5 py-1.5 font-medium hover:bg-primary-600 disabled:opacity-60"
    >
      {pending ? "Verifying…" : "Verify"}
    </button>
  );
}

export function VerifyButton({
  verifyAction,
}: {
  verifyAction: (prevState: VerifyState, formData: FormData) => Promise<VerifyState>;
}) {
  const [state, formAction] = useFormState(verifyAction, { error: null, success: false });

  return (
    <div>
      <form action={formAction}>
        <SubmitButton />
      </form>
      {state.error && <p className="text-xs text-accent-700 mt-1.5">{state.error}</p>}
      {state.success && <p className="text-xs text-primary-700 mt-1.5">Verified!</p>}
    </div>
  );
}
