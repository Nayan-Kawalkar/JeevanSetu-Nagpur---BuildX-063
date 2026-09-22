"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOnlineStatus, useRetryQueue } from "@/lib/offline";

/**
 * A one-line connection strip for the new-case form.
 *
 * The crew needs one glance to answer three questions: does this phone have signal, is anything
 * still sitting on it unsent, and can I push it now. Nothing here is simulated — the state comes
 * from `navigator.onLine` and the real queue, so switching DevTools to offline drives it exactly
 * as a dead patch of Wardha Road would.
 */
export function ConnectionIndicator({ className }: { className?: string }) {
  const { online } = useOnlineStatus();
  const { queued, retryNow, syncing } = useRetryQueue();

  const waiting = queued.length;
  const tone = !online
    ? "border-amber-300 bg-amber-50 text-amber-900"
    : syncing
      ? "border-sky-300 bg-sky-50 text-sky-900"
      : waiting > 0
        ? "border-slate-300 bg-slate-50 text-slate-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-900";

  const dot = !online ? "bg-amber-500" : syncing ? "bg-sky-500 animate-pulse" : waiting > 0 ? "bg-slate-500" : "bg-emerald-500";

  const label = !online ? "No signal" : syncing ? "Sending…" : "Online";

  return (
    <div
      aria-live="polite"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 text-sm", tone, className)}
    >
      <span className="inline-flex items-center gap-2 font-semibold">
        <span className={cn("h-2.5 w-2.5 rounded-full", dot)} aria-hidden />
        {label}
      </span>
      <span>
        {waiting === 0
          ? "Nothing waiting to send."
          : waiting === 1
            ? "1 case saved on this phone, not sent yet."
            : `${waiting} cases saved on this phone, not sent yet.`}
      </span>
      {waiting > 0 && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="ml-auto"
          onClick={() => void retryNow()}
          loading={syncing}
          disabled={!online}
        >
          {syncing ? "Sending" : "Send now"}
        </Button>
      )}
    </div>
  );
}
