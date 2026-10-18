"use client";

import { useState, useTransition } from "react";
import { sendContactEmail } from "@/app/(app)/send-email-action";

export function SendEmailButton({ email, name }: { email: string; name?: string }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setSent(false);
    setError(null);
    setSubject("");
    setBody("");
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      try {
        await sendContactEmail(email, subject, body);
        setSent(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to send email");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs border border-background-300 rounded-md px-2.5 py-1.5 text-foreground-700 hover:bg-background-100 whitespace-nowrap"
      >
        <i className="ri-mail-send-line" />
        Email
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={close}
        >
          <div
            className="bg-background-50 rounded-lg shadow-xl w-full max-w-md mx-4 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {sent ? (
              <div className="text-center py-4">
                <div className="w-10 h-10 rounded-full bg-secondary-100 text-secondary-700 flex items-center justify-center mx-auto mb-3">
                  <i className="ri-check-line text-xl" />
                </div>
                <p className="text-sm font-medium text-foreground-950">Email sent</p>
                <p className="text-xs text-foreground-500 mt-1">Delivered to {name || email}</p>
                <button
                  onClick={close}
                  className="mt-4 text-xs border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground-950">
                    Send email to {name ? `${name}` : email}
                  </h3>
                  <button
                    onClick={close}
                    className="p-1 rounded text-foreground-500 hover:text-foreground-950 hover:bg-background-100"
                  >
                    <i className="ri-close-line" />
                  </button>
                </div>

                {name && (
                  <p className="text-[11px] text-foreground-500 mb-3">{email}</p>
                )}

                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full text-sm border border-background-300 rounded-md px-3 py-2 bg-background-50 outline-none focus:border-primary-500"
                  />
                  <textarea
                    placeholder="Message"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={6}
                    className="w-full text-sm border border-background-300 rounded-md px-3 py-2 bg-background-50 outline-none focus:border-primary-500 resize-none"
                  />
                </div>

                {error && (
                  <p className="mt-2 text-xs text-red-600">{error}</p>
                )}

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={close}
                    className="text-xs border border-background-300 rounded-md px-3 py-1.5 text-foreground-700 hover:bg-background-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={!subject.trim() || !body.trim() || isPending}
                    className="text-xs bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {isPending ? (
                      <>
                        <i className="ri-loader-4-line animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <i className="ri-mail-send-line" />
                        Send
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
