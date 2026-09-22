import type { Metadata } from "next";
import { RelayScreen } from "./RelayScreen";

export const metadata: Metadata = {
  title: "Blackout relay",
  description:
    "Twist 2: when there is no data connection, one 160-character SMS carries a whole case from the crew to the control room.",
};

/**
 * Twist 2 — the blackout relay.
 *
 * Server component so the route can carry metadata; everything below reads the browser's
 * connection state and the on-device queue, so it is all client.
 */
export default function RelayPage() {
  return <RelayScreen />;
}
