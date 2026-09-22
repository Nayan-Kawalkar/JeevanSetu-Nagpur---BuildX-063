import type { Metadata } from "next";
import { ParamedicCaseList, ParamedicIntro } from "./ParamedicCaseList";

export const metadata: Metadata = { title: "Paramedic" };

/**
 * The crew's home screen: one big way in, then everything already open.
 *
 * This stays a server component so it can export route metadata — the chosen locale lives in the
 * browser, so the title cannot be translated here without guessing. The heading, the disclaimer
 * and the "new case" control moved into ParamedicIntro, a client component, because they read the
 * locale. The "new case" link is still a plain anchor rendered in the server HTML, so it works on
 * the first paint before any JavaScript runs — the one control on this screen that must never be
 * waiting on a poll.
 */
export default function ParamedicPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <ParamedicIntro />
      <ParamedicCaseList />
    </div>
  );
}
