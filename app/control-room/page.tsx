import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export const metadata = { title: "Control room" };

export default function ControlRoomPage() {
  return (
    <PhasePlaceholder
      title="Control room"
      phase={6}
      description="Map of active incidents, hospital capacity, stale-data and blood alerts, and the live event timeline."
    />
  );
}
