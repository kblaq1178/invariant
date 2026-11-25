import { notFound } from "next/navigation";
import LedgerLab from "../../ledger-lab";

export default async function Fixture({ params }: { params: Promise<{ defect: string }> }) {
  const { defect } = await params;
  if (defect !== "conservation" && defect !== "idempotency") notFound();
  return <LedgerLab key={defect} variant={defect} />;
}
