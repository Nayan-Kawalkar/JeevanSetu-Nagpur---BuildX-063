import { BloodBankConsole } from "./BloodBankConsole";

export const metadata = {
  title: "Blood bank console",
  description: "Confirm the units on the shelf, group by group, for one Nagpur blood bank.",
};

/** Next 16 hands params in as a promise; the id is awaited here and passed to the live console. */
export default async function BloodBankDetailPage({ params }: PageProps<"/blood-bank/[id]">) {
  const { id } = await params;
  return <BloodBankConsole bankId={id} />;
}
