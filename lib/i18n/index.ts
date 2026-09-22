"use client";

/**
 * The translation layer.
 *
 * Usage in a screen:
 *
 *   const t = useT();
 *   <h1>{t("paramedic.newCase")}</h1>
 *   <p>{t("blood.unitsOfGroup", { count: 2, group: "O-" })}</p>
 *
 * And for a value that came from the API, build the key from the enum member:
 *
 *   t(`status.${caseRecord.status}`)
 *
 * Why this module is a client module: the chosen locale lives in the browser (localStorage), so
 * the server has no way to know it. The server always renders English and the client swaps to the
 * stored choice after mount — see LanguageProvider. Server components should therefore not call
 * `translate` directly; render the text inside a client component instead.
 *
 * Nothing here reads the clock, and nothing reads localStorage during render.
 */

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { LOCALES, type Locale } from "@/lib/types";
import { ageSince } from "@/lib/utils";
import { en } from "./en";
import { hi } from "./hi";
import { mr } from "./mr";

export type { TranslationKey } from "./en";
import type { TranslationKey } from "./en";

/** The signature of the function `useT()` hands back, for components that take it as a prop. */
export type TFunction = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/**
 * Every locale's strings. `en` is complete; `mr` and `hi` are partial and fall back to English
 * key by key, because an untranslated word beats a broken screen during an emergency.
 */
export const DICTIONARIES: Record<Locale, Partial<Record<TranslationKey, string>>> = { en, hi, mr };

const STORAGE_KEY = "jeevansetu.locale";

/** The locale used until the stored choice is known, and whenever storage is unreadable. */
const DEFAULT_LOCALE: Locale = "en";

// ---------- Pure translation ----------

const PLACEHOLDER = /\{(\w+)\}/g;

/** Fills `{name}` placeholders. An unsupplied placeholder is left visible rather than blanked. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (vars === undefined) return template;
  return template.replace(PLACEHOLDER, (match: string, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Translates one key. Pure — no React, no storage — so it can be called from a test or from a
 * helper that formats a sentence outside a component.
 */
export function translate(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string {
  return interpolate(DICTIONARIES[locale][key] ?? en[key], vars);
}

/**
 * "8 min ago" in the reader's own language.
 *
 * Takes the `t` the caller already has rather than being a hook, so it can be used inside a
 * map or a helper without adding a second subscription. `now` comes from useNow, never from a
 * clock read during render, which is why it can be null: until the browser clock is known there
 * is no honest age to state, and the caller shows an absolute time instead.
 */
export function formatAge(t: TFunction, iso: string, now: number): string {
  const age = ageSince(iso, now);
  if (age.unit === "now") return t("duration.justNow");
  return age.unit === "min"
    ? t("duration.minutesAgo", { count: age.value })
    : t("duration.hoursAgo", { count: age.value });
}

// ---------- Persistence ----------

function isLocale(value: string | null): value is Locale {
  return value !== null && (LOCALES as readonly string[]).includes(value);
}

function readStoredLocale(): Locale | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    // Private mode or blocked storage: fall back to English rather than failing to render.
    return null;
  }
}

function writeStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // The choice simply does not survive a reload. Not worth interrupting anyone over.
  }
}

// ---------- The locale as an external store ----------

/**
 * The chosen locale lives outside React, for the same reason the clock in lib/hooks.ts does:
 * localStorage must not be read during render, or the server markup and the first client paint
 * disagree and hydration breaks. `null` means "not known yet" — the server and the first paint
 * both see it and render English, and the real choice arrives on the render after mount.
 */
let currentLocale: Locale | null = null;
const listeners = new Set<() => void>();

function subscribeLocale(onChange: () => void): () => void {
  listeners.add(onChange);
  // Subscribing happens after mount, never during render, so reading storage here is safe.
  currentLocale ??= readStoredLocale() ?? DEFAULT_LOCALE;
  return () => {
    listeners.delete(onChange);
  };
}

function localeSnapshot(): Locale | null {
  return currentLocale;
}

function serverLocaleSnapshot(): Locale | null {
  return null;
}

/** Records the choice and tells every mounted provider about it. */
function publishLocale(next: Locale): void {
  writeStoredLocale(next);
  if (currentLocale === next) return;
  currentLocale = next;
  for (const listener of listeners) listener();
}

// ---------- Context ----------

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/**
 * The default is English with an inert setter: a component rendered outside the provider degrades
 * to English rather than crashing a screen someone is relying on. The warning makes a missing
 * provider findable instead of silent.
 */
const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {
    console.warn("[i18n] setLocale called outside <LanguageProvider>; the language did not change.");
  },
});

/**
 * Holds the chosen locale for the tree below it. Mount it once, high up (the root layout).
 *
 * SSR-safe by construction: the first render is English on the server and on the client, so the
 * markup matches; the stored choice is applied on the render after mount.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(subscribeLocale, localeSnapshot, serverLocaleSnapshot);
  const locale = stored ?? DEFAULT_LOCALE;

  // Keeps <html lang> honest, which is what a screen reader picks its voice from.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({ locale, setLocale: publishLocale }), [locale]);

  // createElement rather than JSX because this file is .ts, not .tsx.
  return createElement(LocaleContext.Provider, { value }, children);
}

/** The current locale and a setter that also persists the choice. */
export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** The translate function bound to the current locale. Stable until the locale changes. */
export function useT(): TFunction {
  const { locale } = useLocale();
  return useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );
}
