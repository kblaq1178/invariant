import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "../../workbench/workspace";
import { loadArchive } from "../../../src/workspace/archive";
import { sections } from "../../../src/workspace/receipts";

export const metadata: Metadata = { title: "Invariant · Public demonstration", description: "Replay a genuine conservation repair benchmark." };
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ section: [] }, ...sections.filter((section) => section !== "overview" && section !== "projects").map((section) => ({ section: [section] }))];
}
export default async function PublicDemo({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section = [] } = await params;
  const active = sections.find((item) => item === (section[0] ?? "overview"));
  if (!active || active === "projects" || section.length > 1) notFound();
  return <Workspace archive={await loadArchive()} active={active} mode="demo" />;
}
