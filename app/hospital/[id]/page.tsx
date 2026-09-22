import type { Metadata } from "next";
import { HospitalConsole } from "../HospitalConsole";

/**
 * Next 16 hands params in as a Promise, so it is awaited here and the plain id is handed to
 * the client console, which owns all of the polling.
 */
export async function generateMetadata({ params }: PageProps<"/hospital/[id]">): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Hospital ${id}`,
    description: "Answer incoming emergency requests and confirm this hospital's available capacity.",
  };
}

export default async function HospitalConsolePage({ params }: PageProps<"/hospital/[id]">) {
  const { id } = await params;
  return <HospitalConsole hospitalId={id} />;
}
