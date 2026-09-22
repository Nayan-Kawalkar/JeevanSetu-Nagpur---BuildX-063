"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { OverflowState, TierCapacity } from "@/lib/services/camps";
import { FACILITY_TIER_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The city, tier by tier — the number the per-patient matcher can never show you.
 *
 * Ranking hospitals for one patient always has an answer: somebody is top of the list. That is
 * exactly what hides an overflow, because the best hospital for each patient considered alone is
 * the same hospital for all of them. This board measures the whole ladder instead, so the room
 * can watch load move down it rather than stack on the top rung.
 */

function barTone(percent: number): string {
  if (percent >= 90) return "bg-red-600";
  if (percent >= 75) return "bg-amber-500";
  return "bg-emerald-600";
}

function UtilisationBar({ percent }: { percent: number }) {
  return (
    <div
      role="img"
      aria-label={`${percent}% of beds in use`}
      className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
    >
      <div className={cn("h-full rounded-full transition-all", barTone(percent))} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function CapacityLadder({
  capacity,
  overflow,
  campCount,
}: {
  capacity: TierCapacity[];
  overflow: OverflowState;
  campCount: number;
}) {
  return (
    <div className="space-y-3">
      <OverflowBanner overflow={overflow} campCount={campCount} />
      <Card>
        <CardHeader
          title="City capacity by tier"
          subtitle="Every rung of the escalation ladder, including empty ones. Counts are the ones hospitals last confirmed themselves."
          action={
            <Badge tone={overflow.overflowing ? "danger" : "success"}>
              Tertiary {overflow.tertiaryUtilisation}% used
            </Badge>
          }
        />
        <CardBody>
          <ul className="divide-y divide-border">
            {capacity.map((tier) => (
              <li key={tier.tier} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-semibold text-slate-900">{FACILITY_TIER_LABEL[tier.tier]}</p>
                  <p className="text-xs text-muted">
                    {tier.facilities} {tier.facilities === 1 ? "facility" : "facilities"}
                  </p>
                </div>
                {tier.facilities === 0 ? (
                  <p className="mt-1 text-sm text-muted">
                    {tier.tier === "CAMP"
                      ? "No camp is standing. Stand one up below and it joins matching immediately."
                      : "No facility of this tier is registered."}
                  </p>
                ) : (
                  <>
                    <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700">
                      <div className="flex gap-1.5">
                        <dt className="text-muted">ICU free</dt>
                        <dd className="font-semibold tabular-nums">
                          {tier.icuFree} of {tier.icuTotal}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-muted">Beds free</dt>
                        <dd className="font-semibold tabular-nums">
                          {tier.bedsFree} of {tier.bedsTotal}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-muted">In use</dt>
                        <dd className="font-semibold tabular-nums">{tier.utilisationPercent}%</dd>
                      </div>
                    </dl>
                    <div className="mt-2">
                      <UtilisationBar percent={tier.utilisationPercent} />
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * States the situation in one sentence with the real number, then says what the system does
 * about it. A banner that only announces a problem makes an operator hunt for the action; this
 * one names it, because the whole argument of this twist is that the system adapts.
 */
function OverflowBanner({ overflow, campCount }: { overflow: OverflowState; campCount: number }) {
  if (!overflow.overflowing) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-sm font-semibold text-emerald-900">The city is not overflowing.</p>
        <p className="mt-1 text-sm text-emerald-800">{overflow.reason}</p>
        <p className="mt-1 text-sm text-emerald-800">
          {campCount > 0
            ? `${campCount} temporary ${campCount === 1 ? "camp is" : "camps are"} still standing and still in the matching pool.`
            : "No camp is needed. Matching is using standing facilities only."}
        </p>
      </div>
    );
  }
  return (
    <div role="status" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3">
      <p className="text-base font-bold text-red-900">Tertiary hospitals are full.</p>
      <p className="mt-1 text-sm text-red-800">{overflow.reason}</p>
      <p className="mt-2 text-sm text-red-800">
        Matching is walking down the escalation ladder rather than giving up: secondary centres for patients
        whose critical needs they genuinely meet, primary centres and camps for minor injuries, deliberately,
        to protect the tier above. Anyone still unplaced needs a camp — stand one up below and it enters
        matching immediately.
      </p>
      <p className="mt-2 text-xs text-red-700">
        Coordination only. A human sites, sizes and signs off every camp; nothing here promises a bed.
      </p>
    </div>
  );
}
