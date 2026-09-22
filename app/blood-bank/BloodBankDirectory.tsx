"use client";

/**
 * Blood bank directory — who is holding what, and when anyone last looked.
 *
 * The city-wide strip comes first on purpose. In an emergency the question is rarely
 * "how much O-negative does Somalwada have" but "is there any O-negative in Nagpur at
 * all, and who has it". A group that totals zero across every bank is the fact that
 * changes a decision, so it is stated in words, not merely coloured red.
 *
 * Every number on this screen was typed in by a person at a refrigerator door, so every
 * card carries the age of its own figures.
 */

import Link from "next/link";
import type { BloodBankWithFreshness } from "@/app/api/bloodbanks/route";
import { FreshnessLabel } from "@/components/labels";
import { StatTile } from "@/components/StatTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage, useLive } from "@/lib/hooks";
import { BLOOD_GROUPS, BLOOD_GROUP_LABEL, type BloodGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

interface BloodBanksResponse {
  bloodBanks: BloodBankWithFreshness[];
}

/** One blood group added up across every bank that reported today. */
interface GroupTotal {
  group: BloodGroup;
  available: number;
  reserved: number;
  /** How many banks hold at least one unit of this group. */
  banksWithStock: number;
  /** Every reporting bank flags this group as low: the city is short, not just one fridge. */
  shortEverywhere: boolean;
}

/**
 * Sums each group across banks. "Short everywhere" is derived from each bank's own
 * `lowGroups` flag rather than a threshold repeated here, so the screen and the matching
 * service can never disagree about what counts as low.
 */
function cityTotals(banks: BloodBankWithFreshness[]): GroupTotal[] {
  return BLOOD_GROUPS.map((group) => {
    let available = 0;
    let reserved = 0;
    let banksWithStock = 0;
    let lowAt = 0;
    for (const bank of banks) {
      const stock = bank.inventory[group];
      available += stock.available;
      reserved += stock.reserved;
      if (stock.available > 0) banksWithStock += 1;
      if (bank.lowGroups.includes(group)) lowAt += 1;
    }
    return {
      group,
      available,
      reserved,
      banksWithStock,
      shortEverywhere: banks.length > 0 && lowAt === banks.length,
    };
  });
}

function CityGroupTile({ total, bankCount }: { total: GroupTotal; bankCount: number }) {
  const none = total.available === 0;
  const short = !none && total.shortEverywhere;
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 text-center",
        none ? "border-red-300 bg-red-50" : short ? "border-amber-300 bg-amber-50" : "border-border bg-white",
      )}
    >
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">{BLOOD_GROUP_LABEL[total.group]}</dt>
      <dd
        className={cn(
          "mt-0.5 text-2xl font-bold tabular-nums",
          none ? "text-red-700" : short ? "text-amber-800" : "text-slate-900",
        )}
      >
        {total.available}
        <span className="sr-only"> units available city-wide</span>
      </dd>
      <dd
        className={cn(
          "text-[11px] font-medium leading-tight",
          none ? "text-red-700" : short ? "text-amber-800" : "text-muted",
        )}
      >
        {none ? "✕ none in city" : short ? "⚠ low at every bank" : `${total.banksWithStock} of ${bankCount} banks`}
      </dd>
      {total.reserved > 0 && (
        <dd className="text-[11px] leading-tight text-muted">{total.reserved} held for a case</dd>
      )}
    </div>
  );
}

function BankStockCell({ group, available, low }: { group: BloodGroup; available: number; low: boolean }) {
  const none = available === 0;
  return (
    <div
      className={cn(
        "rounded-lg border px-1.5 py-1.5 text-center",
        none ? "border-red-300 bg-red-50" : low ? "border-amber-300 bg-amber-50" : "border-border bg-slate-50",
      )}
    >
      <dt className="text-[11px] font-semibold text-slate-600">{BLOOD_GROUP_LABEL[group]}</dt>
      <dd
        className={cn(
          "text-lg font-bold tabular-nums leading-tight",
          none ? "text-red-700" : low ? "text-amber-800" : "text-slate-900",
        )}
      >
        {available}
        <span className="sr-only"> units available</span>
      </dd>
      {(none || low) && (
        <dd className={cn("text-[10px] font-semibold uppercase leading-tight", none ? "text-red-700" : "text-amber-800")}>
          {none ? "none" : "low"}
        </dd>
      )}
    </div>
  );
}

function BankCard({ bank }: { bank: BloodBankWithFreshness }) {
  const lowSet = new Set<BloodGroup>(bank.lowGroups);
  const totalUnits = BLOOD_GROUPS.reduce((sum, group) => sum + bank.inventory[group].available, 0);
  const heldUnits = BLOOD_GROUPS.reduce((sum, group) => sum + bank.inventory[group].reserved, 0);

  return (
    <Card>
      <CardHeader
        title={bank.name}
        subtitle={`${bank.area} · ${bank.phone}`}
        action={
          bank.stale ? (
            <Badge tone="warning">⚠ unconfirmed</Badge>
          ) : (
            <Badge tone="success">✓ confirmed</Badge>
          )
        }
      />
      <CardBody className="space-y-3">
        <dl className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
          {BLOOD_GROUPS.map((group) => (
            <BankStockCell
              key={group}
              group={group}
              available={bank.inventory[group].available}
              low={lowSet.has(group)}
            />
          ))}
        </dl>

        {bank.lowGroups.length > 0 && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            Running low: {bank.lowGroups.map((group) => BLOOD_GROUP_LABEL[group]).join(", ")}. Call{" "}
            {bank.phone} before counting on these units.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-slate-700">
              <span className="font-semibold tabular-nums">{totalUnits}</span> units on the shelf
              {heldUnits > 0 && (
                <span className="text-muted">
                  {" "}
                  · <span className="tabular-nums">{heldUnits}</span> held for a live case
                </span>
              )}
            </p>
            <FreshnessLabel lastUpdatedAt={bank.lastUpdatedAt} stale={bank.stale} updatedBy={bank.updatedBy} />
          </div>
          <Link
            href={`/blood-bank/${bank.id}`}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            Open operator console
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}

export function BloodBankDirectory() {
  const { data, error, isLoading, mutate } = useLive<BloodBanksResponse>("/api/bloodbanks");
  const banks = data?.bloodBanks ?? [];

  const totals = cityTotals(banks);
  const zeroGroups = totals.filter((total) => total.available === 0);
  const unitsCityWide = totals.reduce((sum, total) => sum + total.available, 0);
  const staleBanks = banks.filter((bank) => bank.stale);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Blood banks in Nagpur</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Unit counts as last reported by each bank&apos;s operator. Nothing here is read from a refrigerator: every
          figure was typed in by a person, so each card shows when it was last confirmed. Open a bank to update its
          stock.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
        >
          <span>
            ⚠ Live updates interrupted: {errorMessage(error)}.{" "}
            {data ? "The figures below are the last ones received." : ""}
          </span>
          <Button size="sm" variant="secondary" onClick={() => void mutate()}>
            Try again
          </Button>
        </p>
      )}

      {isLoading && !data ? (
        <Card>
          <CardBody>
            <Spinner label="Loading blood bank stock" />
          </CardBody>
        </Card>
      ) : banks.length === 0 ? (
        <EmptyState
          title="No blood banks are reporting"
          description="No bank has registered stock in this demo dataset. Reset the demo data to restore the seeded Nagpur banks."
        />
      ) : (
        <>
          <Card>
            <CardHeader
              title="City-wide stock by group"
              subtitle="Totals across every reporting bank. In an emergency this is the number that decides whether the city can cover a case at all."
              action={<Badge tone="neutral">{banks.length} banks</Badge>}
            />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile label="Units city-wide" value={unitsCityWide} hint="Across all reporting banks" />
                <StatTile
                  label="Groups at zero"
                  value={zeroGroups.length}
                  hint={
                    zeroGroups.length === 0
                      ? "Every group is held somewhere"
                      : `${zeroGroups.map((total) => BLOOD_GROUP_LABEL[total.group]).join(", ")} unavailable city-wide`
                  }
                  tone={zeroGroups.length > 0 ? "danger" : "success"}
                />
                <StatTile
                  label="Banks unconfirmed"
                  value={staleBanks.length}
                  hint={
                    staleBanks.length === 0
                      ? "All counts confirmed recently"
                      : "Counts older than the freshness window count for less when hospitals are ranked"
                  }
                  tone={staleBanks.length > 0 ? "warning" : "neutral"}
                />
              </div>

              {zeroGroups.length > 0 && (
                <p role="status" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  ✕ No units anywhere in the city:{" "}
                  {zeroGroups.map((total) => BLOOD_GROUP_LABEL[total.group]).join(", ")}. A case needing these groups
                  has to be coordinated by phone with a bank outside this network.
                </p>
              )}

              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                {totals.map((total) => (
                  <CityGroupTile key={total.group} total={total} bankCount={banks.length} />
                ))}
              </dl>
            </CardBody>
          </Card>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Each bank</h2>
            <div className="grid gap-4 xl:grid-cols-2">
              {banks.map((bank) => (
                <BankCard key={bank.id} bank={bank} />
              ))}
            </div>
          </section>
        </>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Fictional demo stock for a hackathon prototype. JeevanSetu 360 coordinates information between crews, hospitals
        and banks; it does not reserve units by itself and does not guarantee that any unit will be available on
        arrival. No donor or patient details are held here.
      </p>
    </div>
  );
}
