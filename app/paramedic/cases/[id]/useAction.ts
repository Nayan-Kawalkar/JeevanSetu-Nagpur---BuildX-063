"use client";

import { useCallback, useState } from "react";
import { mutate as globalMutate } from "swr";
import { errorMessage } from "@/lib/hooks";

/**
 * Revalidates every polled endpoint except the non-mutating match preview.
 *
 * `GET /api/cases/:id/match` answers 409 for a case that is no longer active, which is correct:
 * there is nothing left to rank once the patient has been handed over. The screen already stops
 * polling it — but a blanket revalidation fired the instant a status POST resolves runs before
 * React has re-rendered with the new status, so it refetches a key the screen is about to drop
 * and turns a normal handover into a console error. The match panel polls itself every three
 * seconds while the case is active, so skipping it here costs nothing and keeps the last step of
 * the run clean.
 */
function refreshExceptMatchPreview(): Promise<unknown> {
  return globalMutate((key) => typeof key === "string" && !key.endsWith("/match"), undefined, {
    revalidate: true,
  });
}

/**
 * One in-flight mutation at a time, with the server's own sentence kept when it fails.
 *
 * Every control on this screen moves an ambulance or holds a bed, so a second tap while the
 * first is still travelling must do nothing: `busy` names the control that is running and the
 * caller disables it. On success every polled endpoint is revalidated, because a status change
 * here also changes the hospital board, the control room and the ranking.
 *
 * Failures are shown verbatim. "No ICU bed free at Orange City" tells a crew what to do next;
 * "Request failed" does not.
 */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async function run<T>(key: string, call: () => Promise<T>): Promise<T | undefined> {
    setBusy(key);
    setError(null);
    try {
      const result = await call();
      await refreshExceptMatchPreview();
      return result;
    } catch (err) {
      setError(errorMessage(err));
      return undefined;
    } finally {
      setBusy(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { busy, error, run, clearError };
}
