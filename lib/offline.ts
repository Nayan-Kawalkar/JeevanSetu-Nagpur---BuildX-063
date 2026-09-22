"use client";

/**
 * Offline drafts and a retry queue for the paramedic form.
 *
 * A crew on Wardha Road at night loses signal mid-incident. Without this module the new-case
 * form simply fails and everything they typed is gone; with it the typing survives in the
 * browser, the request waits on the phone, and it leaves the moment there is signal again.
 *
 * Three deliberate constraints run through the whole file:
 *
 *  1. The clock is never read during render. `Date.now()` in a component body is a React 19
 *     lint error and a hydration bug, so every timestamp here is taken inside an event handler,
 *     an effect, a timer or a store subscription — never while rendering.
 *  2. `navigator` and `localStorage` are never read during render either. Both are read after
 *     mount only, through external stores, so the server-rendered markup and the first client
 *     paint agree: we assume online, and we assume there is no draft, until we know better.
 *  3. Every storage read and write is wrapped in try/catch. Private mode and blocked site data
 *     make `localStorage` throw; a crashed form is far worse than a lost draft.
 *
 * Privacy: the only clinical free text that ever reaches browser storage is what the crew typed
 * into this one draft (and the same text once it is queued as an unsent request). Nothing else —
 * no case history, no patient identity, no server data, no tokens — is written here, and both
 * records are deleted the moment the case is accepted by the server. See `clearDraft()` and the
 * success path of `drain()`.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { errorMessage, HttpError, send } from "@/lib/hooks";

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Storage may be absent (SSR) or throw (private mode, blocked site data). Never let it escape. */
function readStorage(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {
    // Quota, private mode, or site data blocked. The form keeps working from memory.
  }
}

function removeStorage(key: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  } catch {
    // Nothing sensible to do; the value simply stays until the browser clears it.
  }
}

/** Stable client-side id. `crypto.randomUUID` is not available on every venue browser. */
function clientId(prefix: string): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // Fall through to the arithmetic fallback.
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* -------------------------------------------------------------------------- */
/* Online status                                                              */
/* -------------------------------------------------------------------------- */

export interface OnlineStatus {
  online: boolean;
  /** When the current online/offline state began, in ms. Null until the first change is seen. */
  since: number | null;
}

/**
 * Assume online on the server and for the first paint.
 *
 * Guessing "offline" would make every crew see a scary banner for a frame on a perfectly good
 * connection, so the honest default is the optimistic one; `navigator.onLine` corrects it a tick
 * after mount.
 */
const ASSUMED_ONLINE: OnlineStatus = { online: true, since: null };

let onlineSnapshot: OnlineStatus = ASSUMED_ONLINE;
const onlineListeners = new Set<() => void>();

function setOnline(next: boolean, at: number): void {
  if (onlineSnapshot.online === next && onlineSnapshot.since !== null) return;
  onlineSnapshot = { online: next, since: at };
  for (const listener of onlineListeners) listener();
}

function subscribeOnline(onChange: () => void): () => void {
  onlineListeners.add(onChange);
  // Subscribing happens after mount, never during render, so reading navigator here is safe.
  setOnline(window.navigator.onLine, Date.now());
  const goOnline = () => {
    setOnline(true, Date.now());
    void wakeOnReconnect();
  };
  const goOffline = () => setOnline(false, Date.now());
  window.addEventListener("online", goOnline);
  window.addEventListener("offline", goOffline);
  return () => {
    onlineListeners.delete(onChange);
    window.removeEventListener("online", goOnline);
    window.removeEventListener("offline", goOffline);
  };
}

/**
 * Whether the browser believes it has a connection, plus when that last changed.
 *
 * Driven entirely by `navigator.onLine` and the online/offline events, which is exactly what
 * DevTools' offline mode toggles — so the whole offline path is testable without any fake
 * switch in production code.
 */
export function useOnlineStatus(): OnlineStatus {
  return useSyncExternalStore(
    subscribeOnline,
    () => onlineSnapshot,
    () => ASSUMED_ONLINE,
  );
}

/* -------------------------------------------------------------------------- */
/* Drafts                                                                     */
/* -------------------------------------------------------------------------- */

const DRAFT_DEBOUNCE_MS = 500;

interface StoredDraft {
  savedAt: number;
  value: unknown;
}

function parseStoredDraft(raw: string): StoredDraft | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as { savedAt?: unknown; value?: unknown };
    if (typeof record.savedAt !== "number" || !("value" in record)) return null;
    return { savedAt: record.savedAt, value: record.value };
  } catch {
    return null;
  }
}

export interface Draft<T> {
  draft: T;
  setDraft: (next: T) => void;
  /** Deletes the stored copy and returns the form to its empty state. */
  clearDraft: () => void;
  /** When the restored draft was last saved, in ms. Null when nothing was restored. */
  restoredAt: number | null;
}

interface DraftSnapshot {
  value: unknown;
  restoredAt: number | null;
}

interface DraftStore {
  /** What render reads. Replaced, never mutated, so React can compare it by identity. */
  snapshot: DraftSnapshot;
  /** The empty form: what the server and the first paint show, and what a discard returns to. */
  initial: DraftSnapshot;
  listeners: Set<() => void>;
  loaded: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  pending: unknown;
}

/**
 * One store per storage key, outside React.
 *
 * The draft cannot simply be `useState` seeded from storage: reading storage during render would
 * make the server markup and the first client paint disagree, and restoring it from an effect
 * means a setState inside an effect — a cascading render React 19 rightly complains about.
 * An external store reads storage in `subscribe` (after mount, outside render) and pushes the
 * restored value in exactly the way `useSyncExternalStore` is built for.
 */
const DRAFT_STORES = new Map<string, DraftStore>();

function draftStoreFor(key: string, initial: unknown): DraftStore {
  const existing = DRAFT_STORES.get(key);
  if (existing) return existing;
  const snapshot: DraftSnapshot = { value: initial, restoredAt: null };
  const store: DraftStore = {
    snapshot,
    initial: snapshot,
    listeners: new Set(),
    loaded: false,
    timer: null,
    pending: undefined,
  };
  DRAFT_STORES.set(key, store);
  return store;
}

function publishDraft(store: DraftStore, next: DraftSnapshot): void {
  store.snapshot = next;
  for (const listener of store.listeners) listener();
}

/** Writes the debounced value out now. Called by the timer and on the last unsubscribe. */
function flushDraft(store: DraftStore, key: string): void {
  if (store.timer !== null) {
    clearTimeout(store.timer);
    store.timer = null;
  }
  if (store.pending === undefined) return;
  const value = store.pending;
  store.pending = undefined;
  // Date.now() inside a timer or an unmount, never during render.
  writeStorage(key, JSON.stringify({ savedAt: Date.now(), value }));
}

function subscribeDraft(store: DraftStore, key: string, onChange: () => void): () => void {
  store.listeners.add(onChange);
  if (!store.loaded) {
    store.loaded = true;
    // Subscribing happens after mount, so touching localStorage here is safe.
    const raw = readStorage(key);
    const stored = raw === null ? null : parseStoredDraft(raw);
    if (raw !== null && stored === null) {
      // Written by an older build of the form, or corrupt. Drop it rather than guess.
      removeStorage(key);
    } else if (stored !== null) {
      publishDraft(store, { value: stored.value, restoredAt: stored.savedAt });
    }
  }
  return () => {
    store.listeners.delete(onChange);
    // The crew may be closing the form to take a call; keep what they typed.
    if (store.listeners.size === 0) flushDraft(store, key);
  };
}

/** Records a new value and (re)arms the debounced write. Module scope: the hook only calls it. */
function setDraftValue(store: DraftStore, key: string, next: unknown): void {
  publishDraft(store, { value: next, restoredAt: store.snapshot.restoredAt });
  store.pending = next;
  if (store.timer !== null) clearTimeout(store.timer);
  store.timer = setTimeout(() => {
    store.timer = null;
    flushDraft(store, key);
  }, DRAFT_DEBOUNCE_MS);
}

function clearDraftValue(store: DraftStore, key: string): void {
  if (store.timer !== null) {
    clearTimeout(store.timer);
    store.timer = null;
  }
  store.pending = undefined;
  // The draft is the only clinical free text this app puts in browser storage, so it goes the
  // moment it is no longer needed — on a successful create, or when the crew discards it.
  removeStorage(key);
  publishDraft(store, store.initial);
}

/**
 * A form value that survives a lost connection, a locked phone, or a closed tab.
 *
 * Writes are debounced (~500 ms) so a fast typist does not hit storage on every keystroke.
 * The restore lands after mount, which is why `restoredAt` is null on the server and for the
 * first paint: the crew is told a draft came back and from when, and can throw it away, rather
 * than finding old text silently sitting in the boxes.
 */
export function useDraft<T>(key: string, initial: T): Draft<T> {
  const store = draftStoreFor(key, initial);

  const subscribe = useCallback(
    (onChange: () => void) => subscribeDraft(store, key, onChange),
    [store, key],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => store.snapshot,
    () => store.initial,
  );

  const setDraft = useCallback((next: T) => setDraftValue(store, key, next), [store, key]);
  const clearDraft = useCallback(() => clearDraftValue(store, key), [store, key]);

  // The stored value is whatever was in the browser; the caller normalises it before use.
  return { draft: snapshot.value as T, setDraft, clearDraft, restoredAt: snapshot.restoredAt };
}

/* -------------------------------------------------------------------------- */
/* Retry queue                                                                */
/* -------------------------------------------------------------------------- */

const QUEUE_KEY = "jeevansetu.retry-queue.v1";
/** After this many failures the queue stops guessing and asks the crew what to do. */
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

export type QueuedMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export interface QueuedRequest {
  /** Client-side id for this queue entry, used by the UI to follow one submission. */
  id: string;
  url: string;
  method: QueuedMethod;
  body: unknown;
  /**
   * Sent with the body. A retry after an answer we never saw must not open a second case or
   * raise a second hospital request, so the key stays the same for every attempt.
   */
  idempotencyKey: string;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  /** True once the queue has stopped trying and is waiting for a manual "Send now". */
  paused: boolean;
  /**
   * True when the server refused the content itself. Signal will never fix that, so a
   * reconnection must not quietly start trying again.
   */
  permanent: boolean;
}

export interface EnqueueInput {
  url: string;
  method: QueuedMethod;
  body: Record<string, unknown>;
  /** Supply a stable key when the caller already has one; otherwise one is generated. */
  idempotencyKey?: string;
}

export interface RetryQueue {
  queued: QueuedRequest[];
  enqueue: (input: EnqueueInput) => string;
  retryNow: () => Promise<void>;
  discard: (id: string) => void;
  syncing: boolean;
}

interface QueueSnapshot {
  queued: QueuedRequest[];
  syncing: boolean;
}

const EMPTY_SNAPSHOT: QueueSnapshot = { queued: [], syncing: false };

let queue: QueuedRequest[] = [];
let syncing = false;
let loaded = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let queueSnapshot: QueueSnapshot = EMPTY_SNAPSHOT;
const queueListeners = new Set<() => void>();

function isQueuedMethod(value: unknown): value is QueuedMethod {
  return value === "POST" || value === "PATCH" || value === "PUT" || value === "DELETE";
}

function parseQueued(value: unknown): QueuedRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Partial<Record<keyof QueuedRequest, unknown>>;
  if (typeof r.id !== "string" || typeof r.url !== "string" || !isQueuedMethod(r.method)) return null;
  if (typeof r.idempotencyKey !== "string" || typeof r.createdAt !== "number") return null;
  return {
    id: r.id,
    url: r.url,
    method: r.method,
    body: r.body,
    idempotencyKey: r.idempotencyKey,
    createdAt: r.createdAt,
    attempts: typeof r.attempts === "number" ? r.attempts : 0,
    lastError: typeof r.lastError === "string" ? r.lastError : null,
    paused: r.paused === true,
    permanent: r.permanent === true,
  };
}

/**
 * Loads the queue from storage once, after mount.
 *
 * A queued case holds the same text the crew typed into the draft and nothing more, so it lives
 * under the same promise: it is deleted as soon as the server has it.
 */
function loadQueue(): void {
  if (loaded) return;
  loaded = true;
  const raw = readStorage(QUEUE_KEY);
  if (raw === null) return;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      removeStorage(QUEUE_KEY);
      return;
    }
    queue = parsed.flatMap((entry) => {
      const item = parseQueued(entry);
      return item === null ? [] : [item];
    });
    publish();
  } catch {
    removeStorage(QUEUE_KEY);
  }
}

function persistQueue(): void {
  if (queue.length === 0) removeStorage(QUEUE_KEY);
  else writeStorage(QUEUE_KEY, JSON.stringify(queue));
}

function publish(): void {
  queueSnapshot = { queued: queue, syncing };
  for (const listener of queueListeners) listener();
}

function subscribeQueue(onChange: () => void): () => void {
  queueListeners.add(onChange);
  loadQueue();
  return () => {
    queueListeners.delete(onChange);
  };
}

function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
}

function scheduleRetry(delay: number): void {
  if (retryTimer !== null) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void drain();
  }, delay);
}

/**
 * A 4xx will fail exactly the same way forever — the control room refused the content, it is not
 * a signal problem — so the queue stops immediately and shows the server's own sentence instead
 * of hammering a doomed request. 408 and 429 are the exceptions: those do clear with time.
 */
function isPermanent(err: unknown): boolean {
  if (!(err instanceof HttpError)) return false;
  if (err.status === 408 || err.status === 429) return false;
  return err.status >= 400 && err.status < 500;
}

/**
 * Sends queued requests oldest first, stopping at the first failure.
 *
 * Order matters and a later request may depend on an earlier one, so nothing overtakes a stuck
 * entry. Only one drain runs at a time, which is also what stops a "Send now" tap racing the
 * automatic drain into sending the same case twice.
 */
async function drain(): Promise<void> {
  if (syncing) return;
  // No signal: leave everything untouched rather than burning the attempt budget on failures
  // that were never going to land. The online event restarts the drain.
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const pending = queue.filter((item) => !item.paused);
  if (pending.length === 0) return;
  syncing = true;
  publish();

  try {
    for (const item of pending) {
      // The item may have been discarded while an earlier one was in flight.
      if (!queue.includes(item)) continue;
      try {
        await send(item.url, item.method, item.body);
        queue = queue.filter((q) => q.id !== item.id);
        persistQueue();
        publish();
      } catch (err) {
        const attempts = item.attempts + 1;
        const permanent = isPermanent(err);
        const stopped = permanent || attempts >= MAX_ATTEMPTS;
        const updated: QueuedRequest = {
          ...item,
          attempts,
          lastError: errorMessage(err),
          paused: stopped,
          permanent,
        };
        queue = queue.map((q) => (q.id === item.id ? updated : q));
        persistQueue();
        publish();
        if (!stopped) scheduleRetry(backoffMs(attempts));
        // Stop the pass: if this failed for want of signal, everything behind it will too.
        break;
      }
    }
  } finally {
    syncing = false;
    publish();
  }
}

function enqueueRequest(input: EnqueueInput): string {
  loadQueue();
  const id = clientId("q");
  const idempotencyKey = input.idempotencyKey ?? clientId("idem");
  const item: QueuedRequest = {
    id,
    url: input.url,
    method: input.method,
    // The key travels with the body, so attempt three cannot create a second case.
    body: { ...input.body, idempotencyKey },
    idempotencyKey,
    createdAt: Date.now(), // Inside an event handler, never during render.
    attempts: 0,
    lastError: null,
    paused: false,
    permanent: false,
  };
  queue = [...queue, item];
  persistQueue();
  publish();
  // If there is signal this leaves immediately; if not, the online event picks it up.
  scheduleRetry(0);
  return id;
}

/**
 * Signal is back: entries that only ever failed for want of a connection get a fresh attempt
 * budget and go out again. Entries the server actually refused stay put and keep asking.
 */
async function wakeOnReconnect(): Promise<void> {
  loadQueue();
  const woken = queue.map((item) =>
    item.paused && !item.permanent ? { ...item, paused: false, attempts: 0 } : item,
  );
  if (woken.some((item, i) => item !== queue[i])) {
    queue = woken;
    persistQueue();
    publish();
  }
  await drain();
}

function discardRequest(id: string): void {
  queue = queue.filter((item) => item.id !== id);
  persistQueue();
  publish();
}

async function retryNowInternal(): Promise<void> {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  // A manual tap is the crew saying "try again now", so the paused entries wake up with a clean
  // attempt count and the backoff starts over.
  queue = queue.map((item) => (item.paused ? { ...item, paused: false, attempts: 0, permanent: false } : item));
  persistQueue();
  publish();
  await drain();
}

/**
 * The shared queue of requests that have not reached the server yet.
 *
 * One queue for the whole tab: the form that enqueues a case and the connection indicator that
 * counts what is waiting are looking at the same list.
 */
export function useRetryQueue(): RetryQueue {
  const snapshot = useSyncExternalStore(
    subscribeQueue,
    () => queueSnapshot,
    () => EMPTY_SNAPSHOT,
  );
  const { online } = useOnlineStatus();

  // Coming back online drains the queue. The online event does this too; this effect also covers
  // the tab that was loaded while already offline and then regained signal.
  useEffect(() => {
    if (online) void wakeOnReconnect();
  }, [online]);

  return {
    queued: snapshot.queued,
    syncing: snapshot.syncing,
    enqueue: enqueueRequest,
    retryNow: retryNowInternal,
    discard: discardRequest,
  };
}
