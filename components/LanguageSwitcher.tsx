"use client";

import { useLocale, useT } from "@/lib/i18n";
import { LOCALES, LOCALE_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Three buttons rather than a dropdown: one tap instead of two, and all three languages are
 * visible at once so someone who cannot read English still sees "मराठी" without opening anything.
 *
 * Each button carries `lang` so the browser renders Devanagari with the right font and a screen
 * reader switches voice. The active one is marked with aria-pressed. Targets are 44 px tall for
 * a gloved thumb.
 *
 * It places itself nowhere — drop it in a header, a settings row, or the family page.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const t = useT();

  return (
    <div
      role="group"
      aria-label={t("nav.language")}
      className={cn("inline-flex gap-1 rounded-lg bg-slate-100 p-1", className)}
    >
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            aria-pressed={active}
            onClick={() => setLocale(code)}
            className={cn(
              "min-h-[44px] rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2",
              active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white",
            )}
          >
            {LOCALE_LABEL[code]}
          </button>
        );
      })}
    </div>
  );
}
