"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResourceChips } from "@/components/ResourceChips";
import { SuitabilityBadge } from "@/components/labels";
import { useNow } from "@/lib/hooks";
import { BLOOD_GROUP_LABEL, type BloodGroup, type Hospital, type RankedHospital } from "@/lib/types";
import { cn, formatTime, timeAgo } from "@/lib/utils";

/**
 * One ranked hospital. The reasons matter more than the number: a paramedic has to be
 * able to disagree with the recommendation, which means seeing exactly why it was made.
 */
export function HospitalRankCard({
  ranked,
  hospital,
  bloodBankName,
  bloodGroup,
  role,
  requesting,
  onRequest,
  disabled,
}: {
  ranked: RankedHospital;
  hospital: Hospital;
  bloodBankName?: string;
  bloodGroup?: BloodGroup;
  role?: "PRIMARY" | "BACKUP";
  requesting?: boolean;
  onRequest?: () => void;
  disabled?: boolean;
}) {
  const unsuitable = ranked.suitability === "UNSUITABLE";
  // How old the bed count is matters as much as the count itself, but the clock may only be
  // read outside render: null on the server and the first paint, where the absolute time is shown.
  const now = useNow(60_000);

  return (
    <article
      className={cn(
        "rounded-xl border p-4 transition-colors",
        role === "PRIMARY"
          ? "border-emerald-400 bg-emerald-50/60 ring-2 ring-emerald-200"
          : unsuitable
            ? "border-red-200 bg-red-50/40"
            : "border-border bg-white",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {role === "PRIMARY" && <Badge tone="success">Recommended</Badge>}
            {role === "BACKUP" && <Badge tone="info">Backup</Badge>}
            <SuitabilityBadge suitability={ranked.suitability} />
            {ranked.stale && <Badge tone="warning">Unconfirmed data</Badge>}
          </div>
          <h3 className={cn("mt-1.5 text-base font-semibold", unsuitable ? "text-red-900" : "text-slate-900")}>
            {hospital.name}
          </h3>
          <p className="text-sm text-muted">
            {hospital.area} · {hospital.type === "GOVERNMENT" ? "Government" : "Private"} · {hospital.phone}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{ranked.etaMinutes} min</p>
          <p className="text-xs text-muted">{ranked.distanceKm} km by road</p>
        </div>
      </header>

      <p className={cn("mt-3 text-sm leading-relaxed", unsuitable ? "font-medium text-red-800" : "text-slate-700")}>
        {ranked.explanation}
      </p>

      <div className="mt-3 space-y-2">
        {ranked.matched.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Can provide</p>
            <div className="mt-1">
              <ResourceChips requirements={ranked.matched} size="sm" />
            </div>
          </div>
        )}
        {ranked.missing.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Cannot provide</p>
            <div className="mt-1">
              <ResourceChips
                requirements={ranked.missing}
                missing={ranked.missing}
                missingCritical={ranked.missingCritical}
                size="sm"
              />
            </div>
          </div>
        )}
      </div>

      {ranked.bloodBankId && bloodGroup && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {BLOOD_GROUP_LABEL[bloodGroup]} blood: {ranked.bloodUnitsAvailable} units at{" "}
          {bloodBankName ?? ranked.bloodBankId}, {ranked.bloodDistanceKm} km from the hospital.
        </p>
      )}

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span title="Weighted score: capability, availability, specialists, travel time, data freshness">
            Score <span className="font-semibold tabular-nums text-slate-700">{ranked.score}</span>/100
          </span>
          <ScoreBar breakdown={ranked.breakdown} />
          <span>
            {now === null
              ? `confirmed at ${formatTime(hospital.lastUpdatedAt)}`
              : `confirmed ${timeAgo(hospital.lastUpdatedAt, now)}`}
          </span>
        </div>
        {onRequest && (
          <Button
            variant={role === "PRIMARY" ? "success" : "secondary"}
            size="sm"
            loading={requesting}
            disabled={disabled || unsuitable}
            onClick={onRequest}
            title={unsuitable ? "This hospital cannot treat this patient" : undefined}
          >
            {unsuitable ? "Cannot accept" : "Send request"}
          </Button>
        )}
      </footer>
    </article>
  );
}

const PARTS = [
  { key: "capability", label: "Capability", max: 35, color: "bg-slate-700" },
  { key: "availability", label: "Beds free", max: 25, color: "bg-emerald-600" },
  { key: "specialists", label: "Specialists", max: 15, color: "bg-sky-600" },
  { key: "travel", label: "Travel time", max: 15, color: "bg-amber-500" },
  { key: "freshness", label: "Data freshness", max: 10, color: "bg-violet-500" },
] as const;

function ScoreBar({ breakdown }: { breakdown: RankedHospital["breakdown"] }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {PARTS.map((p) => {
        const got = breakdown[p.key];
        const pct = Math.max(0, Math.min(1, got / p.max));
        return (
          <span
            key={p.key}
            title={`${p.label}: ${got.toFixed(1)} of ${p.max}`}
            className="h-2.5 w-6 overflow-hidden rounded-sm bg-slate-200"
          >
            <span className={cn("block h-full", p.color)} style={{ width: `${pct * 100}%` }} />
          </span>
        );
      })}
    </span>
  );
}
