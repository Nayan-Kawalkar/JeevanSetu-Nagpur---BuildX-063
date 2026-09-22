export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-sm text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}
