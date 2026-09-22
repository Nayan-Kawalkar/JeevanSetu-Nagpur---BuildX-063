"use client";

import { RESOURCE_LABEL, RESOURCE_TYPES, type ResourceType } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Read-only list of requirements, optionally marking which ones a hospital cannot meet. */
export function ResourceChips({
  requirements,
  missing = [],
  missingCritical = [],
  size = "md",
}: {
  requirements: ResourceType[];
  missing?: ResourceType[];
  missingCritical?: ResourceType[];
  size?: "sm" | "md";
}) {
  if (requirements.length === 0) {
    return <p className="text-sm text-muted">No requirements identified yet.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {requirements.map((r) => {
        const critical = missingCritical.includes(r);
        const absent = critical || missing.includes(r);
        return (
          <li
            key={r}
            className={cn(
              "inline-flex items-center gap-1 rounded-md ring-1 ring-inset",
              size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
              critical
                ? "bg-red-50 text-red-700 ring-red-300 font-semibold"
                : absent
                  ? "bg-amber-50 text-amber-800 ring-amber-200"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-200",
            )}
          >
            <span aria-hidden>{absent ? "✕" : "✓"}</span>
            {RESOURCE_LABEL[r]}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Editable requirement chips. The machine proposes, the paramedic decides — an
 * extraction result must always be correctable before it drives a hospital choice.
 */
export function ResourceChipPicker({
  selected,
  onChange,
  disabled,
}: {
  selected: ResourceType[];
  onChange: (next: ResourceType[]) => void;
  disabled?: boolean;
}) {
  const toggle = (r: ResourceType) => {
    onChange(selected.includes(r) ? selected.filter((x) => x !== r) : [...selected, r]);
  };
  return (
    <ul className="flex flex-wrap gap-2">
      {RESOURCE_TYPES.map((r) => {
        const on = selected.includes(r);
        return (
          <li key={r}>
            <button
              type="button"
              onClick={() => toggle(r)}
              disabled={disabled}
              aria-pressed={on}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
                on
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400",
              )}
            >
              {RESOURCE_LABEL[r]}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
