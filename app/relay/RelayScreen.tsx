"use client";

import { ComposePanel } from "./ComposePanel";
import { ReceivePanel } from "./ReceivePanel";
import { OfflineCapabilities, RelayConnection } from "./RelayConnection";

/**
 * Twist 2 — network blackout.
 *
 * The argument this screen makes: our matcher assumes a live connection to a live ledger. A
 * blackout does not make the patient wait, so the system has to degrade into something a crew
 * can still use — and the honest floor of that is one text message.
 */
export function RelayScreen() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Blackout relay</h1>
        <p className="text-sm text-muted">
          Everything else in this app assumes a connection to a live capacity ledger. When there is none, the
          patient still exists — so the case travels as one 160-character SMS, and the control room decodes it
          into the same case the online form would have created.
        </p>
      </header>

      <RelayConnection />

      <OfflineCapabilities />

      <div className="grid gap-4 lg:grid-cols-2">
        <ComposePanel />
        <ReceivePanel />
      </div>
    </div>
  );
}
