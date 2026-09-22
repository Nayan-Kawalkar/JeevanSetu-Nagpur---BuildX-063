"use client";

import { useMemo } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { BloodBankSnapshot } from "@/lib/services/overview";
import { BLOOD_GROUPS, BLOOD_GROUP_LABEL, type BloodGroup } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ageLabel, plural } from "./format";

/**
 * All eight groups across every bank.
 *
 * Which groups count as low is the overview service's judgement, not this screen's: each bank
 * ships its own `lowGroups`, so the board and the API can never disagree about the threshold.
 * Colour is always paired with a word ("none", "low") because a red cell on a wall display
 * seen from across a room is not a message on its own.
 */

type GroupStatus = { word: string; tone: BadgeTone };

const TH = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";
const TD = "px-3 py-3 align-top text-sm text-slate-800";

export function BloodPanel({ bloodBanks }: { bloodBanks: BloodBankSnapshot[] }) {
  const city = useMemo(
    () =>
      BLOOD_GROUPS.map((group) => {
        const total = bloodBanks.reduce((sum, b) => sum + b.inventory[group].available, 0);
        const lowBanks = bloodBanks.filter((b) => b.lowGroups.includes(group)).length;
        const status: GroupStatus =
          total === 0
            ? { word: "None in the city", tone: "danger" }
            : lowBanks > 0
              ? { word: `Low at ${lowBanks} of ${bloodBanks.length}`, tone: "warning" }
              : { word: "Stocked", tone: "success" };
        return { group, total, status };
      }),
    [bloodBanks],
  );

  const emptyGroups = city.filter((g) => g.total === 0).map((g) => BLOOD_GROUP_LABEL[g.group]);
  const lowGroups = city
    .filter((g) => g.total > 0 && g.status.tone === "warning")
    .map((g) => BLOOD_GROUP_LABEL[g.group]);
  const staleBanks = bloodBanks.filter((b) => b.stale).length;

  return (
    <Card>
      <CardHeader
        title="Blood stock"
        subtitle="Units entered by each blood bank, with the time since the stock was last confirmed."
        action={
          <Badge tone={emptyGroups.length > 0 ? "danger" : lowGroups.length > 0 ? "warning" : "success"}>
            {emptyGroups.length > 0
              ? `${emptyGroups.length} group${emptyGroups.length === 1 ? "" : "s"} empty`
              : lowGroups.length > 0
                ? `${lowGroups.length} group${lowGroups.length === 1 ? "" : "s"} low`
                : "All groups stocked"}
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        {bloodBanks.length === 0 ? (
          <EmptyState
            title="No blood bank is registered."
            description="Reset the demo data to load the Nagpur blood banks."
          />
        ) : (
          <>
            {(emptyGroups.length > 0 || lowGroups.length > 0) && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {emptyGroups.length > 0 && (
                  <span className="block font-semibold">
                    <span aria-hidden>✕ </span>
                    Nothing recorded anywhere for {emptyGroups.join(", ")}.
                  </span>
                )}
                {lowGroups.length > 0 && (
                  <span className="block">
                    <span aria-hidden>▲ </span>
                    Running low somewhere: {lowGroups.join(", ")}.
                  </span>
                )}
              </p>
            )}

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                City total by group · {plural(bloodBanks.length, "bank")}
              </h3>
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
                {city.map(({ group, total, status }) => (
                  <li
                    key={group}
                    className={cn(
                      "rounded-lg border p-2",
                      status.tone === "danger"
                        ? "border-red-300 bg-red-50"
                        : status.tone === "warning"
                          ? "border-amber-300 bg-amber-50"
                          : "border-border bg-white",
                    )}
                  >
                    <p className="text-sm font-semibold text-slate-700">{BLOOD_GROUP_LABEL[group]}</p>
                    <p
                      className={cn(
                        "text-2xl font-bold tabular-nums",
                        status.tone === "danger"
                          ? "text-red-700"
                          : status.tone === "warning"
                            ? "text-amber-800"
                            : "text-slate-900",
                      )}
                    >
                      {total}
                      <span className="ml-1 text-xs font-medium text-muted">{total === 1 ? " unit" : " units"}</span>
                    </p>
                    <p
                      className={cn(
                        "text-xs font-medium",
                        status.tone === "danger"
                          ? "text-red-700"
                          : status.tone === "warning"
                            ? "text-amber-800"
                            : "text-muted",
                      )}
                    >
                      {status.word}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                By bank{" "}
                {staleBanks > 0 && <span className="ml-1 text-amber-700">· {staleBanks} unconfirmed</span>}
              </h3>
              <p className="mt-1 text-xs text-muted lg:hidden">Scroll sideways to see every group.</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[48rem] border-collapse">
                  <caption className="sr-only">Units available by blood bank and group, with the age of each figure</caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className={TH}>
                        Blood bank
                      </th>
                      {BLOOD_GROUPS.map((group) => (
                        <th key={group} scope="col" className={cn(TH, "text-center")}>
                          {BLOOD_GROUP_LABEL[group]}
                        </th>
                      ))}
                      <th scope="col" className={TH}>
                        Stock confirmed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bloodBanks.map((bank) => (
                      <tr key={bank.id} className="border-b border-border last:border-b-0">
                        <th scope="row" className={cn(TD, "font-semibold text-slate-900")}>
                          {bank.name}
                          <span className="block text-xs font-normal text-muted">{bank.area}</span>
                        </th>
                        {BLOOD_GROUPS.map((group) => (
                          <BloodCell key={group} bank={bank} group={group} />
                        ))}
                        <td className={TD}>
                          <span className={cn("block", bank.stale ? "font-medium text-amber-700" : "text-muted")}>
                            {bank.stale && <span aria-hidden>⚠ </span>}
                            {ageLabel(bank.dataAgeMinutes)}
                          </span>
                          {bank.stale && (
                            <span className="block text-xs text-amber-700">Unconfirmed — call before promising units</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function BloodCell({ bank, group }: { bank: BloodBankSnapshot; group: BloodGroup }) {
  const { available, reserved } = bank.inventory[group];
  const low = bank.lowGroups.includes(group);
  const empty = available === 0;
  return (
    <td
      className={cn(
        "px-3 py-3 text-center align-top text-sm tabular-nums",
        empty ? "bg-red-50 text-red-700" : low ? "bg-amber-50 text-amber-900" : "text-slate-800",
      )}
    >
      <span className="text-base font-semibold">{available}</span>
      {(empty || low) && (
        <span className="block text-xs font-medium">{empty ? "none" : "low"}</span>
      )}
      {reserved > 0 && <span className="block text-xs text-muted">{reserved} held</span>}
    </td>
  );
}
