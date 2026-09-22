"use client";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { CapacitySnapshot } from "@/lib/services/overview";
import { RESOURCE_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ageLabel } from "./format";

/**
 * Hospital capacity as the room needs to read it: the numbers, the band they add up to, and
 * how long ago a human last confirmed them. A confident bed count nobody has touched for an
 * hour is exactly the thing this board exists to expose, so the age sits in the same row as
 * the number rather than in a tooltip.
 */

const BAND_UI: Record<CapacitySnapshot["capacityBand"], { word: string; tone: BadgeTone }> = {
  GOOD: { word: "Beds free", tone: "success" },
  TIGHT: { word: "Tight", tone: "warning" },
  FULL: { word: "Full", tone: "danger" },
};

const TYPE_LABEL: Record<CapacitySnapshot["type"], string> = {
  GOVERNMENT: "Government",
  PRIVATE: "Private",
};

const TH = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";
const TD = "px-3 py-3 align-top text-sm text-slate-800";

export function CapacityTable({ hospitals }: { hospitals: CapacitySnapshot[] }) {
  const staleCount = hospitals.filter((h) => h.stale).length;

  return (
    <Card>
      <CardHeader
        title="Hospital capacity"
        subtitle="Counts entered by each hospital's coordinator, with the time since they were last confirmed."
        action={
          <Badge tone={staleCount > 0 ? "warning" : "success"}>
            {staleCount > 0 ? `${staleCount} unconfirmed` : "All confirmed"}
          </Badge>
        }
      />
      <CardBody className="space-y-2">
        {hospitals.length === 0 ? (
          <EmptyState title="No hospitals are registered." description="Reset the demo data to load the Nagpur hospitals." />
        ) : (
          <>
            <p className="text-xs text-muted md:hidden">Scroll sideways to see every column.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse">
                <caption className="sr-only">Hospital capacity by hospital, with the age of each figure</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className={TH}>
                      Hospital
                    </th>
                    <th scope="col" className={TH}>
                      Area
                    </th>
                    <th scope="col" className={TH}>
                      ICU free
                    </th>
                    <th scope="col" className={TH}>
                      Emergency beds
                    </th>
                    <th scope="col" className={TH}>
                      Specialists on call
                    </th>
                    <th scope="col" className={TH}>
                      Capacity
                    </th>
                    <th scope="col" className={TH}>
                      Numbers confirmed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {hospitals.map((h) => {
                    const band = BAND_UI[h.capacityBand];
                    return (
                      <tr key={h.hospitalId} className="border-b border-border last:border-b-0">
                        <th scope="row" className={cn(TD, "font-semibold text-slate-900")}>
                          {h.name}
                          <span className="block text-xs font-normal text-muted">{TYPE_LABEL[h.type]}</span>
                        </th>
                        <td className={TD}>{h.area}</td>
                        <td className={cn(TD, "tabular-nums")}>
                          <span className={cn("font-semibold", h.icuAvailable === 0 && "text-red-700")}>
                            {h.icuAvailable} of {h.icuTotal}
                          </span>
                          {h.icuTotal === 0 ? (
                            <span className="block text-xs text-muted">No ICU here</span>
                          ) : h.icuAvailable === 0 ? (
                            <span className="block text-xs font-medium text-red-700">None free</span>
                          ) : null}
                        </td>
                        <td className={cn(TD, "tabular-nums")}>
                          <span className={cn("font-semibold", h.edAvailable === 0 && "text-red-700")}>
                            {h.edAvailable} of {h.edTotal}
                          </span>
                          {h.edAvailable === 0 && (
                            <span className="block text-xs font-medium text-red-700">None free</span>
                          )}
                        </td>
                        <td className={TD}>
                          {h.specialistsOnCall.length === 0 ? (
                            <span className="text-amber-700">None on call</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {h.specialistsOnCall.map((s) => (
                                <Badge key={s} tone="neutral">
                                  {RESOURCE_LABEL[s]}
                                </Badge>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className={TD}>
                          <Badge tone={band.tone}>{band.word}</Badge>
                        </td>
                        <td className={TD}>
                          <span className={cn("block", h.stale ? "font-medium text-amber-700" : "text-muted")}>
                            {h.stale && <span aria-hidden>⚠ </span>}
                            {ageLabel(h.dataAgeMinutes)}
                          </span>
                          {h.stale && <span className="block text-xs text-amber-700">Unconfirmed — call first</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
