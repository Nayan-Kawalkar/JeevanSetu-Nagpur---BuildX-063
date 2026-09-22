"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { mutate as globalMutate } from "swr";
import { errorMessage, send } from "@/lib/hooks";

/**
 * Response of POST /api/demo/reset — shape read from app/api/demo/reset/route.ts, not guessed.
 * The counts are what the freshly seeded store contains, so the presenter can see the reset landed.
 */
interface ResetResult {
  ok: boolean;
  seededAt: string;
  counts: {
    hospitals: number;
    bloodBanks: number;
    ambulances: number;
    cases: number;
    requests: number;
    events: number;
  };
}

/** How long the "Demo restored" confirmation stays on screen before it gets out of the way. */
const CONFIRMATION_MS = 6000;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * One-press restore of the scripted demo scenario, available from every screen.
 *
 * A judge clicking through the flow leaves the in-memory store mid-scenario, and the next demo has
 * to start from a clean slate without anyone reaching for a terminal. Because the reset wipes every
 * case, it asks first — a real modal <dialog>, which gives us the top layer, a focus trap, Escape to
 * cancel and focus handed back to the trigger, rather than window.confirm (unstyled, unlabelled, and
 * blocked outright in some embedded browsers).
 */
export function DemoReset() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const triggerId = useId();

  // The dialog is opened through the DOM API, never the `open` attribute: only showModal() puts it
  // in the top layer, so it clears the sticky header instead of being clipped by it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    return () => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current);
      if (focusTimer.current !== null) clearTimeout(focusTimer.current);
    };
  }, []);

  /** The reset button itself, which sits in the header on every route. */
  function focusTrigger() {
    const trigger = document.getElementById(triggerId);
    if (trigger instanceof HTMLElement) trigger.focus();
  }

  function announce(message: string) {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    setRestored(message);
    hideTimer.current = setTimeout(() => setRestored(null), CONFIRMATION_MS);
  }

  function handleOpen() {
    // <body> is what activeElement reports when nothing is focused, and focusing it back on close
    // would be the same as losing focus — so treat it as "no invoker" and fall through to the
    // trigger instead.
    const active = document.activeElement;
    lastFocused.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setError(null);
    setRestored(null);
    setOpen(true);
  }

  /**
   * Escape closes the confirmation, and this handler — not the browser's close watcher — is what
   * does it. Cancelling the keydown suppresses the native close request, so there is exactly one
   * close path whether the watcher fires or not (it does not, for instance, under automation).
   * The only moment Escape is ignored is while the reset is actually in flight, because closing
   * then would hide the outcome of a request that is already on its way.
   */
  function handleEscape(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (!busy) setOpen(false);
  }

  /** Belt and braces for close requests that arrive without a keydown, e.g. an Android back gesture. */
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (busy) event.preventDefault();
  }

  /** Fires however the dialog closed — Escape, Cancel, or a successful reset. */
  function handleClose() {
    setOpen(false);
    setError(null);
    // Native dialogs hand focus back to the invoker, but a successful reset closes this one across
    // a route change that may have unmounted whatever was focused. Falling back to the reset button
    // means focus never lands back on <body> and a keyboard user keeps their place.
    const previous = lastFocused.current;
    if (previous?.isConnected) previous.focus();
    else focusTrigger();
  }

  /**
   * A route change hands focus back to the document, so anything set before `router.push` resolves
   * is undone. This claims it back for the button the presenter actually pressed, once the new page
   * has painted — and only if nothing else has taken focus in the meantime, so it cannot yank the
   * cursor out from under someone who has already started typing on the new screen.
   */
  function reclaimFocusAfterNavigation() {
    if (focusTimer.current !== null) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      if (document.activeElement === document.body) focusTrigger();
    }, 200);
  }

  async function confirmReset() {
    setBusy(true);
    setError(null);
    try {
      const result = await send<ResetResult>("/api/demo/reset", "POST");
      setBusy(false);
      setOpen(false);
      try {
        // Every polled view is holding data from the store that no longer exists — except the
        // per-case endpoints, which must not be refetched at all. A reset deletes the cases it
        // does not reseed, so refetching `/api/cases/<id>` and its `/match` for the case the
        // presenter happens to be looking at is a guaranteed 404 for a record that was meant to
        // disappear. The list endpoints (`/api/cases?...`) do not carry an id and are refreshed.
        await globalMutate(
          (key) => typeof key === "string" && !key.startsWith("/api/cases/"),
          undefined,
          { revalidate: true },
        );
      } catch {
        // A poll that failed while the store was being swapped is not a failed reset; the views
        // poll again in three seconds anyway.
      }
      router.refresh();
      router.push("/");
      announce(`Demo restored · ${plural(result.counts.hospitals, "hospital")}, ${plural(result.counts.cases, "case")}`);
      reclaimFocusAfterNavigation();
    } catch (err) {
      setBusy(false);
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <Button
        id={triggerId}
        variant="secondary"
        size="sm"
        onClick={handleOpen}
        aria-haspopup="dialog"
        className="whitespace-nowrap"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden focusable="false">
          <path
            d="M10 4a6 6 0 1 0 5.2 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path d="M15.4 2.6v4.6h-4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Reset demo
      </Button>

      {/*
        The live region is always in the DOM — a screen reader only reliably announces a change
        inside a region it was already watching, not one that appears with its text already in it.
        While empty it is sr-only, and an absolutely positioned child is not a flex item, so it
        costs the header no gap.
      */}
      <p
        role="status"
        className={
          restored
            ? "flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
            : "sr-only"
        }
      >
        {restored && (
          <>
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" aria-hidden focusable="false">
              <path
                d="m4.5 10.5 3.5 3.5 7.5-8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {restored}
          </>
        )}
      </p>

      {/* m-auto restores the centring a UA gives a modal dialog; Tailwind's preflight zeroes it. */}
      <dialog
        ref={dialogRef}
        onKeyDown={handleEscape}
        onCancel={handleCancel}
        onClose={handleClose}
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60"
      >
        <div className="p-5 text-left">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            Restore the demo scenario?
          </h2>
          <p id={bodyId} className="mt-2 text-sm leading-relaxed text-slate-600">
            This wipes every case, hospital request and reservation created during this run, and puts the
            hospitals, blood banks and ambulances back to their seeded starting numbers. It cannot be undone.
          </p>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
            >
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={confirmReset}>
              {busy ? "Restoring…" : "Confirm reset"}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
