import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { DemoRolePicker } from "./DemoRolePicker";

export const metadata: Metadata = {
  // Bare, like every other route: the root layout's template appends "· JeevanSetu 360", and
  // spelling it out here produced "Demo access · JeevanSetu 360 · JeevanSetu 360" in the tab.
  title: "Demo access",
  description: "Enter the JeevanSetu 360 demo as a role. Demo access only — not authentication.",
};

/** The cookie decides what is rendered, so this page can never be prerendered. */
export const dynamic = "force-dynamic";

/**
 * The judges' front door.
 *
 * Choosing a role here is what turns on server-side enforcement for the rest of the demo: the
 * cookie it sets is httpOnly and signed by the server, and every protected route re-reads it rather
 * than trusting anything the page sends. Leaving without choosing keeps the demo wide open, which
 * is said plainly below rather than hidden — a demo that quietly lets everyone do everything while
 * claiming to enforce roles would be the dishonest version of this page.
 *
 * Coordination and decision support only.
 */
export default async function DemoLoginPage() {
  // Read on the server purely so the first paint already shows the right state; the panel keeps it
  // fresh from /api/session afterwards.
  const initial = await getSession();

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <Badge tone="warning">Demo access · not authentication</Badge>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">Enter as a role</h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600">
          Pick the role you want to see the emergency from. Your choice is stored in a signed,
          http-only cookie and re-checked on the server for every protected action, so a hospital
          coordinator cannot edit another hospital&rsquo;s beds and a blood-bank operator cannot
          answer a hospital&rsquo;s request.
        </p>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
          <p className="font-semibold">This is demo access, not sign-in.</p>
          <p className="mt-1">
            There is no password, and nothing here proves who you are &mdash; only which role you
            chose. If you leave without choosing a role, the demo runs with full access so the
            scripted walkthrough works on any machine. Production would put real sign-in in front of
            exactly these same server-side checks.
          </p>
        </div>
      </header>

      <DemoRolePicker initialSession={initial} />
    </div>
  );
}
