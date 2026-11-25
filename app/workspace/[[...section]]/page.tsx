import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Workspace } from "../../workbench/workspace";
import { loadArchive } from "../../../src/workspace/archive";
import { sections } from "../../../src/workspace/receipts";

export const metadata: Metadata = { title: "Invariant · Developer workspace", description: "Correctness beyond tests." };
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ section: [] }, ...sections.filter((section) => section !== "overview").map((section) => ({ section: [section] }))];
}
export default async function LocalWorkspace({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section = [] } = await params;
  const active = sections.find((item) => item === (section[0] ?? "overview"));
  if (!active || section.length > 1) notFound();
  if (process.env.INVARIANT_PUBLIC_ONLY === "1") {
    if (active === "projects") notFound();
    redirect("/demo" + (active === "overview" ? "" : "/" + active));
  }
  return <Workspace archive={await loadArchive()} active={active} mode="local" />;
}
