import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export const metadata = { title: "Blood bank" };

export default function BloodBankPage() {
  return (
    <PhasePlaceholder
      title="Blood bank"
      phase={5}
      description="Unit stock by blood group with last-verified time and active emergency reservations."
    />
  );
}
