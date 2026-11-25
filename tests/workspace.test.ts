import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { loadArchive } from "../src/workspace/archive";
import { actorByState, executionRows, parseReceipt } from "../src/workspace/receipts";
import { diffLines } from "../src/workspace/diff";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

test("accepted diff has distinct logical lines and preserves whitespace and hunk numbering", async () => {
  const { bundles } = await loadArchive();
  const lines = diffLines(bundles[0].diff);
  const debit = lines.find((line) => line.text.includes("ledger.balances[sender] - cents"));
  assert.ok(debit && debit.text.startsWith("+        "));
  assert.equal(debit.before, "");
  assert.ok(Number.isInteger(debit.after));
  assert.ok(lines.some((line) => line.tone === "del" && Number.isInteger(line.before) && line.after === ""));
});

test("dashboard archive matches genuine Phase 2 verdicts, money and browser timings", async () => {
  const archive = await loadArchive();
  const [closed, rejected] = archive.bundles;
  assert.equal(closed.receipt.finalStatus, "VERIFIED");
  assert.equal(rejected.receipt.finalStatus, "REJECTED");
  assert.equal(rejected.receipt.postRepair, undefined);
  assert.deepEqual(executionRows(closed.receipt).map(({ result }) => [result.workflow, result.verdict.status,
    result.verdict.expected, result.verdict.observed]), [
    ["PASSED", "VIOLATED", 150000, 160000], ["PASSED", "SATISFIED", 150000, 150000],
    ["PASSED", "SATISFIED", 150000, 150000], ["PASSED", "SATISFIED", 150000, 150000],
  ]);
  assert.deepEqual(closed.receipt.scenarios.map(({ amountCents }) => amountCents), [1000, 25000]);
  assert.equal(closed.receipt.postRepair?.observations?.after_sender.value, "$900.00");
  assert.equal(Object.keys(archive.metadata).length, 5);
  assert.equal(archive.metadata[closed.receipt.postRepair!.executionId].durationSeconds, 74.5);
});

test("archive packet and accepted diff retain exact Phase 2 hashes and recorded actors", async () => {
  const { bundles } = await loadArchive();
  for (const bundle of bundles) assert.equal(sha256(bundle.packet), bundle.receipt.packetSha256);
  assert.equal(sha256(bundles[0].diff), bundles[0].receipt.patch?.diffSha256);
  assert.equal(actorByState.REPAIRING, "Codex");
  assert.equal(actorByState.REVERIFYING, "Kane");
  assert.equal(actorByState.VERIFIED, "Invariant");
});

test("receipt import rejects malformed provenance, objective drift and unjustified verified status", async () => {
  const archive = await loadArchive();
  const build = () => JSON.parse(archive.bundles[0].download);
  const load = (value: unknown) => parseReceipt(value, archive.contractSha256, archive.objectiveSha256, archive.scenarioHashes);
  const cases = [
    (value: ReturnType<typeof build>) => { value.initial.observations.before_sender.provenance.field = "after_sender"; },
    (value: ReturnType<typeof build>) => { value.scenarios[0].result.objectiveSha256 = value.objectiveSha256; },
    (value: ReturnType<typeof build>) => { delete value.postRepair; },
    (value: ReturnType<typeof build>) => { value.postRepair.verdict.observed = 155000; },
    (value: ReturnType<typeof build>) => { value.events[2].state = "VERIFIED"; },
    (value: ReturnType<typeof build>) => { value.patch.changedFiles = ["C:/private/data.txt"]; },
  ];
  for (const mutate of cases) {
    const value = build();
    mutate(value);
    assert.throws(() => load(value), /valid Invariant Phase 2 receipt/);
  }
});

test("import projection excludes unknown fields, diff text and arbitrary evidence paths", async () => {
  const archive = await loadArchive();
  const value = JSON.parse(archive.bundles[0].download);
  value.privateStream = "private value";
  value.initial.testUrl = "https://private.invalid/";
  value.patch.diff = "C:/private/file.ts";
  const output = parseReceipt(value, archive.contractSha256, archive.objectiveSha256, archive.scenarioHashes);
  const json = JSON.stringify(output);
  assert.doesNotMatch(json, /private value|private\.invalid|C:\/private|diff":/);
  assert.equal(output.finalStatus, "VERIFIED");
});
