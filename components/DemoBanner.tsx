"use client";

import { useT } from "@/lib/i18n";

/**
 * The standing notice that none of this is real.
 *
 * Translated, and a client component for that reason: this is the one sentence on the page that
 * must not be missed, and leaving it in English on a Marathi screen defeats the point of saying
 * it at all. The server render shows the English text and the chosen locale replaces it after
 * mount, exactly like every other string.
 */
export function DemoBanner() {
  const t = useT();
  return (
    <div
      role="note"
      className="bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-amber-950"
    >
      {t("app.demoBanner")}
    </div>
  );
}
