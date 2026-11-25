import { notFound } from "next/navigation";
import SandboxRoute from "../../sandbox-route";

export default async function Fixture({ params }: { params: Promise<{ defect: string }> }) {
  const { defect } = await params;
  if (defect !== "conservation" && defect !== "idempotency") notFound();
  return <SandboxRoute variant={defect} />;
}
