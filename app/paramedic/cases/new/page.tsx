import type { Metadata } from "next";
import Link from "next/link";
import { NewCaseForm } from "./NewCaseForm";

export const metadata: Metadata = { title: "New emergency case" };

export default function NewCasePage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <Link
        href="/paramedic"
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
      >
        <span aria-hidden className="mr-1">
          ←
        </span>
        Back to cases
      </Link>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New emergency case</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          This tool coordinates care between the crew, hospitals and blood banks. It does not diagnose and does not
          advise treatment.
        </p>
      </header>

      <NewCaseForm />
    </div>
  );
}
