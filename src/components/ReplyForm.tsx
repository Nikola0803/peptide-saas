"use client";

import { useRef, useState, useTransition } from "react";
import { sendReply } from "@/app/(app)/support/actions";

interface Props {
  conversationId: string;
  placeholder: string;
}

export function ReplyForm({ conversationId, placeholder }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    setWarning(null);
    startTransition(async () => {
      try {
        const result = await sendReply(conversationId, formData);
        formRef.current?.reset();
        if (result?.emailWarning) setWarning(result.emailWarning);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="pt-3 border-t border-background-200">
      <form ref={formRef} onSubmit={handleSubmit} className="flex items-start gap-2">
        <textarea
          name="body"
          required
          rows={2}
          placeholder={placeholder}
          className="flex-1 text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50 resize-none"
        />
        <button
          disabled={isPending}
          className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600 self-stretch disabled:opacity-60"
        >
          {isPending ? "Sending…" : "Send"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {warning && <p className="mt-2 text-xs text-yellow-600">{warning}</p>}
    </div>
  );
}
