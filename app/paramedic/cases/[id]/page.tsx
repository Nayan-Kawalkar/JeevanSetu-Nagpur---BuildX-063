/**
 * /paramedic/cases/[id] — the crew's view of one emergency.
 *
 * A server component that does one thing: await the route params (a Promise in Next 16) and
 * hand the plain id to the client screen. Nothing is fetched here, because everything on this
 * page has to keep moving — beds are taken, requests expire, an ambulance arrives — and a
 * server-rendered snapshot of a live incident is a picture of a moment that has already passed.
 */
import type { Metadata } from "next";
import { CaseScreen } from "./CaseScreen";

export async function generateMetadata(ctx: PageProps<"/paramedic/cases/[id]">): Promise<Metadata> {
  const { id } = await ctx.params;
  return {
    title: `Case ${id}`,
    description: "Requirements, hospital ranking, request status and the run, for one emergency case.",
  };
}

export default async function ParamedicCasePage(ctx: PageProps<"/paramedic/cases/[id]">) {
  const { id } = await ctx.params;
  return <CaseScreen caseId={id} />;
}
