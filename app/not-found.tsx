import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="text-6xl font-black text-slate-200">404</p>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">This page does not exist</h1>
      <p className="mt-1 text-sm text-muted">Check the emergency ID or hospital ID in the address.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
        Back to landing
      </Link>
    </div>
  );
}
