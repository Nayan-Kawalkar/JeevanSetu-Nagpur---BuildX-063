import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export const metadata = { title: "Paramedic" };

export default function ParamedicPage() {
  return (
    <PhasePlaceholder
      title="Paramedic"
      phase={4}
      description="Create an emergency case, review extracted requirements and send a request to the recommended hospital."
    />
  );
}
