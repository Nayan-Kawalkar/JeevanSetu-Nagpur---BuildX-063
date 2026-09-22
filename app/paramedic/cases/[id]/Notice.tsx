"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "error" | "warning" | "info";

/**
 * A short message with a word in front of it.
 *
 * Colour alone is never the signal: every notice states what kind it is ("Failed", "Check",
 * "Note") in text, so it still reads on a sunlit windscreen, in greyscale, or to a screen
 * reader. Errors announce themselves; the quieter tones do not interrupt.
 */
export function Notice({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  const word = tone === "error" ? "Failed" : tone === "warning" ? "Check" : "Note";
  const styles: Record<Tone, string> = {
    error: "border-red-300 bg-red-50 text-red-900",
    warning: "border-amber-300 bg-amber-50 text-amber-900",
    info: "border-slate-300 bg-slate-50 text-slate-700",
  };
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-lg border px-3 py-2 text-sm leading-relaxed", styles[tone], className)}
    >
      <span className="font-semibold">{word}:</span> {children}
    </p>
  );
}
