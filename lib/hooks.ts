"use client";

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

/** Formats an unknown thrown value into something safe to show a user. */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
