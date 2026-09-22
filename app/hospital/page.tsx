import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export const metadata = { title: "Hospital" };

export default function HospitalPage() {
  return (
    <PhasePlaceholder
      title="Hospital coordinator"
      phase={5}
      description="Update ICU, specialist and equipment availability; accept or reject incoming emergency requests."
    />
  );
}
