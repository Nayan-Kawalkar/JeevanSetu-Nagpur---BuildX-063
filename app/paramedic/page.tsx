import type { Metadata } from "next";
import Link from "next/link";
import { ParamedicCaseList } from "./ParamedicCaseList";

export const metadata: Metadata = { title: "Paramedic" };

/**
 * The crew's home screen: one big way in, then everything already open.
 *
 * The "new case" link is a server-rendered anchor so it works on the first paint, before any
 * JavaScript has run — the one control on this screen that must never be waiting on a poll.
 */
export default function ParamedicPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Paramedic</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          This tool coordinates care between the crew, hospitals and blood banks. It does not diagnose and does not
          advise treatment.
        </p>
      </header>

      <Link
        href="/paramedic/cases/new"
        className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-xl bg-red-600 px-5 py-4 text-lg font-bold text-white shadow-sm transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
      >
        <span aria-hidden className="text-2xl leading-none">
          +
        </span>
        New emergency case
      </Link>

      <ParamedicCaseList />
    </div>
  );
}
