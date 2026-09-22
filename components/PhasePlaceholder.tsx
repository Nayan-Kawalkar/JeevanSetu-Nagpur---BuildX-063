import { EmptyState } from "@/components/ui/empty-state";

export function PhasePlaceholder({ title, phase, description }: { title: string; phase: number; description: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      <EmptyState title={`Coming in Phase ${phase}`} description={description} />
    </div>
  );
}
