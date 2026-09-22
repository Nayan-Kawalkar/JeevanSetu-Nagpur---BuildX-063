"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import type { DemoSession } from "@/lib/auth";
import { errorMessage, refreshAll, send, useLive } from "@/lib/hooks";
import type { ActorRole } from "@/lib/types";

/** The minimum a picker needs from an organisation: an id to scope by and a name to show. */
interface Org {
  id: string;
  name: string;
}

interface SessionResponse {
  session: DemoSession | null;
  home: string | null;
}

/** Which directory a role has to pick from before it can be entered. */
type OrgKind = "HOSPITAL" | "BLOOD_BANK" | null;

interface RoleCard {
  role: ActorRole;
  label: string;
  description: string;
  /** What the server will and will not let this role do, in the words a judge should hear. */
  scope: string;
  orgKind: OrgKind;
}

const ROLE_CARDS: RoleCard[] = [
  {
    role: "PARAMEDIC",
    label: "Paramedic",
    description: "Open an emergency case, review what the patient needs, request a hospital and move the ambulance.",
    scope: "May create and move cases. May not edit any hospital's beds or any blood bank's stock.",
    orgKind: null,
  },
  {
    role: "HOSPITAL_COORDINATOR",
    label: "Hospital coordinator",
    description: "Keep ICU, specialist and equipment status current, and answer incoming requests.",
    scope: "Scoped to the hospital you pick: the server refuses any edit to another hospital.",
    orgKind: "HOSPITAL",
  },
  {
    role: "BLOOD_BANK_OPERATOR",
    label: "Blood bank operator",
    description: "Confirm units on the shelf and see what is being held for a case.",
    scope: "Scoped to the bank you pick. May not create cases or answer hospital requests.",
    orgKind: "BLOOD_BANK",
  },
  {
    role: "CONTROL_ROOM_OPERATOR",
    label: "Control room",
    description: "Watch every live incident, hospital capacity, stale data and blood alerts on one board.",
    scope: "Coordinates across the whole city, so it passes every organisation check.",
    orgKind: null,
  },
  {
    role: "FAMILY_MEMBER",
    label: "Family member",
    description: "See a single case's progress, at the level of detail the crew chose to share.",
    scope: "Read-only. Real family access is a per-case link, not a role you can pick.",
    orgKind: null,
  },
  {
    role: "ADMIN",
    label: "Admin",
    description: "The demo operator: everything, including the reset button.",
    scope: "Passes every check. This is also what an unauthenticated visitor gets in demo mode.",
    orgKind: null,
  },
];

/**
 * One DEMO ONLY card per role, plus the current session and a way out of it.
 *
 * The organisation dropdowns are not cosmetic: the id chosen there is what the server pins a
 * coordinator or an operator to, and it is re-validated against the store before the cookie is
 * issued, so a hand-crafted request cannot claim a hospital that does not exist.
 */
export function DemoRolePicker({ initialSession }: { initialSession: DemoSession | null }) {
  const router = useRouter();
  const sessionQuery = useLive<SessionResponse>("/api/session", {
    fallbackData: { session: initialSession, home: null },
  });
  const hospitals = useLive<{ hospitals: Org[] }>("/api/hospitals");
  const banks = useLive<{ bloodBanks: Org[] }>("/api/bloodbanks");

  const [orgChoice, setOrgChoice] = useState<Partial<Record<ActorRole, string>>>({});
  const [busyRole, setBusyRole] = useState<ActorRole | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = sessionQuery.data?.session ?? null;

  function optionsFor(kind: OrgKind): Org[] {
    if (kind === "HOSPITAL") return hospitals.data?.hospitals ?? [];
    if (kind === "BLOOD_BANK") return banks.data?.bloodBanks ?? [];
    return [];
  }

  /** Name of a scoped organisation, falling back to the id while the directories are loading. */
  function orgName(id: string): string {
    const match = [...(hospitals.data?.hospitals ?? []), ...(banks.data?.bloodBanks ?? [])].find((o) => o.id === id);
    return match ? match.name : id;
  }

  /** Falls back to the first organisation in the list, so a card is never un-enterable. */
  function selectedOrg(card: RoleCard): string {
    return orgChoice[card.role] ?? optionsFor(card.orgKind)[0]?.id ?? "";
  }

  async function enterAs(card: RoleCard) {
    setError(null);
    setBusyRole(card.role);
    try {
      const orgId = card.orgKind ? selectedOrg(card) : undefined;
      const result = await send<SessionResponse>("/api/session", "POST", { role: card.role, orgId });
      await refreshAll();
      router.push(result.home ?? "/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyRole(null);
    }
  }

  async function leaveRole() {
    setError(null);
    setLeaving(true);
    try {
      await send<SessionResponse>("/api/session", "DELETE");
      await refreshAll();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Current session"
          subtitle={
            current
              ? "Protected actions are now checked against this role on the server."
              : "No role chosen. The demo is running with full access."
          }
          action={
            current ? (
              <Button variant="secondary" size="sm" onClick={leaveRole} loading={leaving}>
                Leave role
              </Button>
            ) : undefined
          }
        />
        <CardBody className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          {current ? (
            <>
              <Badge tone="dark">{labelFor(current.role)}</Badge>
              <span className="font-medium text-slate-900">{current.name}</span>
              {current.orgId && <span className="text-muted">Scoped to {orgName(current.orgId)}</span>}
            </>
          ) : (
            <>
              <Badge tone="warning">Open demo access</Badge>
              <span>
                Every action is allowed, and the timeline records it as the role of whichever screen
                pressed the button.
              </span>
            </>
          )}
        </CardBody>
      </Card>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ROLE_CARDS.map((card) => {
          const options = optionsFor(card.orgKind);
          const selectId = `org-${card.role}`;
          const isCurrent = current?.role === card.role;
          return (
            <Card key={card.role} className="flex flex-col">
              <CardBody className="flex flex-1 flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base font-semibold text-slate-900">{card.label}</p>
                  <Badge tone="warning">DEMO ONLY</Badge>
                </div>
                <p className="text-sm text-slate-600">{card.description}</p>
                <p className="text-xs leading-relaxed text-muted">{card.scope}</p>

                {card.orgKind && (
                  <Field
                    label={card.orgKind === "HOSPITAL" ? "Which hospital are you?" : "Which blood bank are you?"}
                    hint="This is what scopes your permissions on the server."
                    htmlFor={selectId}
                  >
                    <Select
                      id={selectId}
                      value={selectedOrg(card)}
                      disabled={options.length === 0}
                      onChange={(e) => setOrgChoice((prev) => ({ ...prev, [card.role]: e.target.value }))}
                    >
                      {options.length === 0 && <option value="">Loading…</option>}
                      {options.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}

                <div className="mt-auto pt-1">
                  <Button
                    className="w-full"
                    onClick={() => enterAs(card)}
                    loading={busyRole === card.role}
                    disabled={card.orgKind !== null && options.length === 0}
                  >
                    {isCurrent ? `Continue as ${card.label.toLowerCase()}` : `Enter as ${card.label.toLowerCase()}`}
                  </Button>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-muted">
        Nothing on this page authenticates anybody. It records a chosen role in a signed http-only
        cookie so the server can demonstrate real authorisation checks during the demo. No clinical
        decision, diagnosis or treatment follows from the role you pick.
      </p>
    </div>
  );
}

/** Card label for a role, so the session summary reads the same words as the buttons. */
function labelFor(role: ActorRole): string {
  return ROLE_CARDS.find((card) => card.role === role)?.label ?? role;
}
