"use client";

import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { Alert, AlertLevel } from "@/lib/services/overview";
import { cn } from "@/lib/utils";
import { casePath } from "./format";

/**
 * The loudest panel on the board after the counts.
 *
 * Alerts arrive already sorted worst-first by the overview service and are only grouped here,
 * never re-sorted, so the list does not rearrange itself between two polls that saw the same
 * city. Each line carries the level as a word and a symbol as well as a colour, and links to
 * the screen where somebody can actually do something about it.
 */

const LEVEL_ORDER: readonly AlertLevel[] = ["CRITICAL", "WARNING", "INFO"];

const LEVEL_UI: Record<
  AlertLevel,
  { word: string; symbol: string; tone: BadgeTone; row: string; heading: string }
> = {
  CRITICAL: {
    word: "Critical",
    symbol: "!",
    tone: "danger",
    row: "border-l-red-600 bg-red-50",
    heading: "Critical — act now",
  },
  WARNING: {
    word: "Warning",
    symbol: "▲",
    tone: "warning",
    row: "border-l-amber-500 bg-amber-50",
    heading: "Warning — check before you rely on it",
  },
  INFO: {
    word: "Info",
    symbol: "i",
    tone: "info",
    row: "border-l-sky-500 bg-sky-50",
    heading: "For information",
  },
};

const KIND_LABEL: Record<Alert["kind"], string> = {
  UNANSWERED_REQUEST: "Unanswered request",
  BLOOD_SHORTAGE: "Blood shortage",
  NO_ICU: "No ICU bed",
  EXPIRING_RESERVATION: "Hold expiring",
  STALE_DATA: "Unconfirmed numbers",
};

const linkClass =
  "inline-flex min-h-[44px] items-center rounded font-medium text-slate-900 underline underline-offset-4 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500";

export function AlertPanel({ alerts }: { alerts: Alert[] }) {
  const grouped = LEVEL_ORDER.map((level) => ({
    level,
    items: alerts.filter((a) => a.level === level),
  })).filter((group) => group.items.length > 0);

  return (
    <Card>
      <CardHeader
        title="Alerts"
        subtitle="Worst first. Every line names the place and what to do next."
        action={
          <Badge tone={alerts.length === 0 ? "success" : "dark"}>
            {alerts.length === 0 ? "All clear" : `${alerts.length} open`}
          </Badge>
        }
      />
      <CardBody>
        {grouped.length === 0 ? (
          <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-4 py-8 text-center">
            <p className="text-lg font-semibold text-emerald-800">Nothing needs attention.</p>
            <p className="mt-1 text-sm text-emerald-900/80">
              No unanswered request, blood shortage, empty ICU list, expiring hold or unconfirmed count right now.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(({ level, items }) => {
              const ui = LEVEL_UI[level];
              return (
                <section key={level} aria-labelledby={`alert-group-${level}`}>
                  <h3
                    id={`alert-group-${level}`}
                    className="text-xs font-semibold uppercase tracking-wide text-muted"
                  >
                    {ui.heading} · {items.length}
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {items.map((alert) => (
                      <li key={alert.id} className={cn("rounded-r-lg border-l-4 px-3 py-2", ui.row)}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <Badge tone={ui.tone}>
                            <span aria-hidden>{ui.symbol}</span>
                            {ui.word}
                          </Badge>
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                            {KIND_LABEL[alert.kind]}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-snug text-slate-900 sm:text-base">{alert.message}</p>
                        <div className="flex flex-wrap items-center gap-x-5 text-sm">
                          {alert.caseId && (
                            <Link className={linkClass} href={casePath(alert.caseId)}>
                              Open case {alert.caseId}
                            </Link>
                          )}
                          {alert.hospitalId && (
                            <Link className={linkClass} href="/hospital">
                              Hospital board
                            </Link>
                          )}
                          {alert.bloodBankId && (
                            <Link className={linkClass} href="/blood-bank">
                              Blood bank board
                            </Link>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
