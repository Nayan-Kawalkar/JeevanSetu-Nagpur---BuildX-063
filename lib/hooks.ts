"use client";

import { useSyncExternalStore } from "react";
import useSWR, { mutate as globalMutate, type SWRConfiguration } from "swr";

/** Every dashboard polls; there is no websocket in this build and 3 s is fast enough to feel live. */
export const POLL_MS = 3000;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<never> {
  let body: unknown;
  let message = `Request failed (${res.status})`;
  try {
    body = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      message = body.error;
    }
  } catch {
    // Non-JSON error body; keep the generic message.
  }
  throw new HttpError(res.status, message, body);
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) await readError(res);
  return (await res.json()) as T;
}

/** POST/PATCH helper that surfaces the server's own error sentence to the UI. */
export async function send<T>(url: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) await readError(res);
  return (await res.json()) as T;
}

const LIVE: SWRConfiguration = {
  refreshInterval: POLL_MS,
  revalidateOnFocus: true,
  keepPreviousData: true,
};

/** Polls a JSON endpoint. Pass null to skip (e.g. while an id is unknown). */
export function useLive<T>(url: string | null, config: SWRConfiguration = {}) {
  return useSWR<T>(url, fetcher<T>, { ...LIVE, ...config });
}

/** Forces an immediate refresh of every polled endpoint whose key starts with the prefix. */
export function refresh(prefix: string) {
  return globalMutate((key) => typeof key === "string" && key.startsWith(prefix), undefined, { revalidate: true });
}

/** After any mutation, the case, hospital, overview and health views are all potentially stale. */
export function refreshAll() {
  return globalMutate(() => true, undefined, { revalidate: true });
}

type Clock = {
  subscribe: (onTick: () => void) => () => void;
  snapshot: () => number | null;
};

/** One shared ticker per interval, so ten countdowns on a screen cost one timer, not ten. */
const CLOCKS = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  const existing = CLOCKS.get(intervalMs);
  if (existing) return existing;
  let value: number | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();
  const clock: Clock = {
    subscribe(onTick) {
      listeners.add(onTick);
      // Subscribing happens after mount, never during render, so reading the clock here is safe
      // and gives the first subscriber the real time immediately instead of one interval late.
      value = Date.now();
      timer ??= setInterval(() => {
        value = Date.now();
        for (const listener of listeners) listener();
      }, intervalMs);
      return () => {
        listeners.delete(onTick);
        if (listeners.size === 0) {
          clearInterval(timer);
          timer = undefined;
        }
      };
    },
    snapshot: () => value,
  };
  CLOCKS.set(intervalMs, clock);
  return clock;
}

/**
 * The wall clock, refreshed every `intervalMs`, as an external store React can read safely.
 *
 * Countdowns ("38 s to respond") and freshness labels ("last confirmed 12 min ago") need the
 * current time, but reading it during render is impure — React 19 rejects `Date.now()` in a
 * component body, and a render-time clock also makes the server-rendered markup disagree with
 * the first client render. The clock is therefore only ever read outside render, which means
 * callers get `null` on the server and for the first paint and must show something honest
 * (an absolute timestamp, a placeholder) rather than an age guessed from an unknown clock.
 */
export function useNow(intervalMs = 1000): number | null {
  const clock = clockFor(intervalMs);
  return useSyncExternalStore(clock.subscribe, clock.snapshot, () => null);
}

/**
 * Reads the `details` list that an API validation failure carries.
 *
 * Every route validates through parseBody, which answers `{ error: "Validation failed",
 * details: [{ path, message }] }`. The headline alone ("Validation failed") tells a paramedic
 * nothing about which field to fix, so the field sentences are pulled out here. Raw Zod issues
 * (path as an array) are handled too, because the generic handler passes those through.
 */
function validationDetails(body: unknown): string[] {
  if (typeof body !== "object" || body === null || !("details" in body)) return [];
  const details = (body as { details: unknown }).details;
  if (!Array.isArray(details)) return [];
  return details.flatMap((detail): string[] => {
    if (typeof detail !== "object" || detail === null) return [];
    const entry = detail as { path?: unknown; message?: unknown };
    if (typeof entry.message !== "string") return [];
    const path = Array.isArray(entry.path)
      ? entry.path.join(".")
      : typeof entry.path === "string"
        ? entry.path
        : "";
    return [path === "" ? entry.message : `${path}: ${entry.message}`];
  });
}

/** Formats an unknown thrown value into something safe — and specific — to show a user. */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpError) {
    const parts = validationDetails(err.body);
    return parts.length > 0 ? `${err.message} — ${parts.join("; ")}` : err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
