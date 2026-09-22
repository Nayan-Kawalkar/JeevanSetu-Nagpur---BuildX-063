import Link from "next/link";
import { DEMO_ROLES } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";

export default function LandingPage() {
  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-5 lg:items-center">
        <div className="lg:col-span-3">
          <Badge tone="danger">Healthcare &amp; Emergency Services · Nagpur</Badge>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            The right hospital, not merely the nearest one.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
            JeevanSetu 360 puts ICU beds, on-call specialists, blood stock, travel time and hospital acceptance on one
            shared board, so an ambulance never arrives at a hospital that cannot treat the patient.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/paramedic"
              className="inline-flex items-center rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700"
            >
              Start the Rohan demo
            </Link>
            <Link
              href="/control-room"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Open control room
            </Link>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Today, without coordination</p>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex gap-2"><span className="font-mono text-muted">23:20</span> Truck hits motorcyclist on Wardha Road</li>
              <li className="flex gap-2"><span className="font-mono text-muted">23:34</span> Ambulance reaches nearest private hospital: no ICU, no neurosurgeon</li>
              <li className="flex gap-2"><span className="font-mono text-muted">00:09</span> Government hospital: low on O-negative</li>
              <li className="flex gap-2"><span className="font-mono text-muted">01:10</span> Admitted at a hospital that had a bed all along</li>
            </ol>
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              1 h 50 min lost. Bed status, specialists and blood stock lived in phone calls and registers.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Enter as a demo role</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DEMO_ROLES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="group rounded-xl border border-border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow"
            >
              <p className="text-base font-semibold text-slate-900 group-hover:underline">{r.label}</p>
              <p className="mt-1 text-sm text-slate-600">{r.description}</p>
              <p className="mt-3 text-xs font-medium text-muted">Demo access · no login</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
