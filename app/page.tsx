import LedgerLab from "./ledger-lab";
import { redirect } from "next/navigation";

export default function Home() {
  if (process.env.INVARIANT_PUBLIC_ONLY === "1") redirect("/demo");
  return <LedgerLab variant="corrected" />;
}
