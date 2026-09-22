/**
 * /family/[token] — the page a relative opens from a link in a message.
 *
 * A server component that does one thing: await the route params (a Promise in Next 16) and
 * hand the raw token to the client view. Nothing is fetched or rendered on the server, because
 * a server-rendered snapshot of a moving ambulance is already out of date by the time it is
 * read — and because the token must never end up in a cached HTML response.
 */
import type { Metadata } from "next";
import { FamilyStatus } from "../FamilyStatus";

/**
 * No title carries the token, and search engines are told to stay away: a family link is meant
 * to travel in one WhatsApp message, not into an index.
 */
export const metadata: Metadata = {
  title: "Emergency status",
  description: "Read-only status of one emergency, shared by the ambulance service. Fictional demo data.",
  robots: { index: false, follow: false },
};

export default async function FamilyPage({ params }: PageProps<"/family/[token]">) {
  const { token } = await params;
  return <FamilyStatus token={token} />;
}
