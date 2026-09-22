"use client";

/**
 * The crew's control for the family status link.
 *
 * In the track scenario the family is the last to know anything: they ring relatives, they post
 * in WhatsApp groups, and eventually someone drives to the wrong hospital. One tap here gives
 * them a read-only page instead.
 *
 * The control is honest about what it hands out. The link is a key: it carries no password and
 * no login, so whoever holds it can read the status. That sentence sits above the button, not
 * buried under it, and Revoke is always one tap away.
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { send, useLive, useNow } from "@/lib/hooks";
import type { FamilyAccessToken } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { Notice } from "./Notice";
import { useAction } from "./useAction";

interface FamilyLinkList {
  links: FamilyAccessToken[];
}

/** The origin cannot change while the page is open, so there is nothing to subscribe to. */
const subscribeToNothing = () => () => {};
const readOrigin = (): string | null => window.location.origin;
const readNoOrigin = (): string | null => null;

/** Absolute date and time, because "expires in 11 h" alone is useless at a shift handover. */
function formatExpiry(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} ${formatTime(iso)}`;
}

export function FamilyLinkCard({ caseId }: { caseId: string }) {
  const listUrl = `/api/family?caseId=${encodeURIComponent(caseId)}`;
  const { data } = useLive<FamilyLinkList>(listUrl);
  const { busy, error, run, clearError } = useAction();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // The origin is an external value that never changes, so it is read the same way the clock
  // is: null on the server and on the first paint, the real value on the render after mount.
  // Reading window during render would make the server markup and the first client paint
  // disagree, and an effect that calls setState would just be a slower way to do the same.
  const origin = useSyncExternalStore(subscribeToNothing, readOrigin, readNoOrigin);

  const link = data?.links[0];
  const path = link ? `/family/${link.token}` : null;
  const fullUrl = path === null ? null : origin === null ? path : `${origin}${path}`;

  const create = useCallback(() => {
    setCopied(false);
    setCopyFailed(false);
    void run("family-create", () => send(`/api/family`, "POST", { caseId, actorRole: "PARAMEDIC" }));
  }, [caseId, run]);

  const revoke = useCallback(
    (token: string) => {
      setCopied(false);
      setCopyFailed(false);
      void run("family-revoke", () => send(`/api/family`, "DELETE", { token, actorRole: "PARAMEDIC" }));
    },
    [run],
  );

  const copy = useCallback(async () => {
    if (fullUrl === null) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
    } catch {
      // Clipboard access is refused on an insecure origin and in some locked-down browsers.
      // The link is on screen and selectable, so this is an inconvenience, not a failure.
      setCopyFailed(true);
    }
  }, [fullUrl]);

  return (
    <Card>
      <CardHeader
        title="Family status link"
        subtitle="A read-only page for the family: status, hospital, ETA and whether blood is arranged. No notes, no names."
      />
      <CardBody className="space-y-3">
        {error !== null && (
          <Notice tone="error">
            {error}{" "}
            <button type="button" className="underline underline-offset-2" onClick={clearError}>
              Dismiss
            </button>
          </Notice>
        )}

        <p className="text-sm leading-relaxed text-slate-700">
          Anyone who holds this link can open the status page — there is no login and no password.
          Send it to the family only, and revoke it if it goes anywhere else.
        </p>

        {link === undefined ? (
          <Button size="lg" loading={busy === "family-create"} disabled={busy !== null} onClick={create}>
            Create family link
          </Button>
        ) : (
          <>
            <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Link</p>
              <p className="mt-1 break-all font-mono text-sm text-slate-900">{fullUrl}</p>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="font-semibold text-slate-700">Expires</dt>
                <dd className="text-slate-900">
                  {formatExpiry(link.expiresAt)} <Remaining iso={link.expiresAt} />
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-700">Opened</dt>
                <dd className="text-slate-900">
                  {link.viewCount === 0
                    ? "Not opened yet"
                    : `${link.viewCount} ${link.viewCount === 1 ? "time" : "times"}`}
                  {link.lastViewedAt !== undefined && ` · last at ${formatTime(link.lastViewedAt)}`}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                variant="secondary"
                disabled={fullUrl === null}
                onClick={() => {
                  void copy();
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button
                size="lg"
                variant="danger"
                loading={busy === "family-revoke"}
                disabled={busy !== null}
                onClick={() => revoke(link.token)}
              >
                Revoke link
              </Button>
            </div>

            {copyFailed && (
              <Notice tone="warning">
                This browser would not let the page use the clipboard. Select the link above and copy it by hand.
              </Notice>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** "· 11 h left", added only once a real clock exists. The absolute time is always shown. */
function Remaining({ iso }: { iso: string }) {
  const now = useNow(60_000);
  if (now === null) return null;
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (minutes <= 0) return <span className="text-muted">· expired</span>;
  const label = minutes < 60 ? `${minutes} min left` : `${Math.round(minutes / 60)} h left`;
  return <span className="text-muted">· {label}</span>;
}
