import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import catalog from "../../contracts/v1.json";
import verified from "../../docs/evidence/phase-2-closed-loop.json";
import rejected from "../../docs/evidence/phase-2-first-attempt.json";
import timings from "../../docs/evidence/phase-2-browser-metadata.json";
import inventorySeeded from "../../docs/evidence/inventory-seeded.json";
import inventoryCorrected from "../../docs/evidence/inventory-corrected.json";
import { objectives } from "../kane/objectives";
import { makePacket } from "../repair/loop";
import { executionRows, parseReceipt } from "./receipts";
import { inventoryArchive } from "./inventory-archive";

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

export async function loadArchive() {
  const root = process.cwd();
  const evidence = join(root, "docs", "evidence");
  const [contract, verifiedDiff, rejectedDiff] = await Promise.all([
    readFile(join(root, "contracts", "v1.json")),
    readFile(join(evidence, "phase-2-closed-loop.diff"), "utf8"),
    readFile(join(evidence, "phase-2-first-attempt.diff"), "utf8"),
  ]);
  const contractSha256 = sha256(contract);
  const objectiveSha256 = sha256(objectives.transfer.objective);
  const scenarioHashes = Object.fromEntries([1000, 25000].map((cents) => [
    cents, sha256(objectives.transfer.objective.replace("100.00", (cents / 100).toFixed(2))),
  ]));
  const bundles = [
    { input: verified, diff: verifiedDiff, label: "Verified closed loop", note: "Phase 2 benchmark" },
    { input: rejected, diff: rejectedDiff, label: "First repair attempt", note: "Local validator blocked re-verification" },
  ].map(({ input, diff, label, note }) => {
    const receipt = parseReceipt(input, contractSha256, objectiveSha256, scenarioHashes);
    if (!receipt.initial || sha256(diff) !== (receipt.patch?.diffSha256 ?? verified.patch.diffSha256)) {
      throw new Error("The bundled archive failed integrity checks.");
    }
    const packet = JSON.stringify(makePacket(receipt.initial, receipt.objective, contractSha256, receipt.allowedPaths), null, 2);
    if (sha256(packet) !== receipt.packetSha256) throw new Error("The archived repair packet hash did not match.");
    return { receipt, diff, packet, label, note, download: JSON.stringify(input, null, 2) };
  });
  const metadata = Object.fromEntries(bundles.flatMap(({ receipt }) => executionRows(receipt).map(({ result }) => {
    const timing = timings.find((item) => item.executionId === result.executionId && item.stdoutSha256 === result.stdoutSha256);
    if (!timing || !Number.isFinite(timing.durationSeconds) || timing.durationSeconds < 0 ||
        !Number.isFinite(Date.parse(timing.completedAt))) throw new Error("Bundled browser timing is unavailable.");
    return [result.executionId, { durationSeconds: timing.durationSeconds, completedAt: timing.completedAt }];
  })));
  return { catalog, bundles, contractSha256, objectiveSha256, scenarioHashes, metadata,
    inventory: inventoryArchive([inventorySeeded, inventoryCorrected]) };
}
export type Archive = Awaited<ReturnType<typeof loadArchive>>;
