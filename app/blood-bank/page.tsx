import { BloodBankDirectory } from "./BloodBankDirectory";

export const metadata = {
  title: "Blood banks",
  description:
    "Reported unit stock by blood group at every Nagpur blood bank in the demo network, with city-wide totals and the age of each report.",
};

export default function BloodBankPage() {
  return <BloodBankDirectory />;
}
