import type { Metadata } from "next";
import { HospitalPicker } from "./HospitalPicker";

export const metadata: Metadata = {
  title: "Hospital",
  description: "Pick a Nagpur hospital to open its coordinator console: incoming requests, capacity and activity.",
};

/**
 * Entry point for the hospital coordinator role: choose which desk you are sitting at.
 *
 * The picker itself polls, so it is a client component; this shell exists only to carry the
 * page metadata and keep the route a server component.
 */
export default function HospitalPage() {
  return <HospitalPicker />;
}
