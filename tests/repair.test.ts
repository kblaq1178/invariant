import assert from "node:assert/strict";
import { test } from "node:test";
import { normalize } from "../src/kane/observations";
import { objectives } from "../src/kane/objectives";
import { checkBrowser, makePacket, runRepair, type BrowserEvidence, type Dependencies } from "../src/repair/loop";
import { completedCodex } from "../src/repair/codex";
import { hash, validateInventory, validateSource } from "../src/repair/patch";
import { seedSource } from "../src/repair/target";

// These are synthetic protocol inputs for unit tests; production has no fixture transport.
const contractSha256 = hash("unit contract");
const objective = "unit objective";
const target = ["transactions.ts"];
const context = { runId: "unit", objective, objectiveSha256: hash(objective),
  contractSha256, allowedPaths: target, snapshotSha256: hash("unit snapshot"), protectedHashes: {} };
function browser(text: string, violated: boolean): BrowserEvidence {
  const executionId = "unit-kane";
  const stdoutSha256 = hash("unit stream");
  return { executionId, workflow: "PASSED", contractSha256, objectiveSha256: hash(text), stdoutSha256,
    stderrSha256: hash(""), creditsConsumed: 3,
    observations: normalize(objectives.transfer.keys, { before_sender: "$1,000.00", before_recipient: "$500.00",
      after_sender: violated ? "$1,000.00" : "$900.00", after_recipient: "$600.00" }, executionId, stdoutSha256) };
}
const agent = { completed: true, exitCode: 0, timedOut: false, durationMs: 2,
  stdoutSha256: hash("unit agent"), stderrSha256: hash("") };
function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  let count = 0;
  return {
    integrity: async () => true,
    observe: async (_amount, text) => browser(text, count++ === 0),
    repair: async () => agent,
    validate: async () => ({ changedFiles: target, diff: "unit diff", diffSha256: hash("unit diff"), localChecks: "PASSED" }),
    scenarioObjective: String,
    ...overrides,
  };
}

test("eligible packet contains math, original observation provenance, scope and no source", () => {
  const packet = makePacket(checkBrowser(browser(objective, true)), objective, contractSha256, target);
  assert.equal(packet.expected.totalCents, 150000);
  assert.equal(packet.actual.afterTotalCents, 160000);
  assert.equal(packet.actual.differenceCents, 10000);
  assert.deepEqual(packet.allowedPaths, target);
  assert.throws(() => makePacket(checkBrowser(browser(objective, false)), objective, contractSha256, target));
  assert.throws(() => makePacket(checkBrowser(browser(objective, true)), objective, hash("drift"), target));
});
test("failed workflow and missing observations are ineligible even with a suspected defect", async () => {
  for (const result of [{ ...browser(objective, true), workflow: "FAILED" }, { ...browser(objective, true), observations: undefined }]) {
    const receipt = await runRepair(context, dependencies({
      observe: async () => result, repair: async () => assert.fail("must not authorize repair"),
    }));
    assert.equal(receipt.finalStatus, "INCONCLUSIVE");
    assert.equal(receipt.initial?.verdict.status, "INCONCLUSIVE");
  }
});
test("closed-loop lifecycle, identical primary objective, additional amounts, and receipt", async () => {
  const runs: [number, string][] = [];
  let repairs = 0;
  const receipt = await runRepair(context, dependencies({
    observe: async (amount, text) => { runs.push([amount, text]); return browser(text, runs.length === 1); },
    repair: async (packet) => { repairs++; assert.match(packet, /differenceCents/); return agent; },
  }));
  assert.deepEqual(runs, [[10000, objective], [10000, objective], [1000, "1000"], [25000, "25000"]]);
  assert.equal(repairs, 1);
  assert.equal(receipt.creditsConsumed, 12);
  assert.equal(receipt.finalStatus, "VERIFIED");
  assert.ok(receipt.packetSha256);
  assert.equal(receipt.patch?.diffSha256, hash("unit diff"));
  assert.deepEqual(receipt.events.map(({ state }) => state), [
    "READY", "OBSERVING", "EVALUATING", "VIOLATION_DETECTED", "REPAIR_AUTHORIZED", "REPAIRING",
    "VALIDATING_PATCH", "REVERIFYING", "VERIFIED",
  ]);
});
test("Codex errors stop the loop without retrying or validating", async () => {
  assert.equal(completedCodex('{"type":"turn.completed"}'), true);
  assert.equal(completedCodex('{"type":"turn.failed"}'), false);
  assert.equal(completedCodex('{"type":"turn.completed"}\n{"type":"error"}'), false);
  let calls = 0;
  const receipt = await runRepair(context, dependencies({
    repair: async () => { calls++; return { ...agent, completed: false, exitCode: 1 }; },
    validate: async () => assert.fail("must not validate"),
  }));
  assert.equal(receipt.finalStatus, "FAILED");
  assert.equal(calls, 1);
});
test("scope validation rejects extra files and empty patches", async () => {
  const before = new Map([["transactions.ts", hash("old")]]);
  assert.throws(() => validateInventory(before, new Map([...before, ["generated/", "directory"]])));
  assert.throws(() => validateInventory(before, before));
  assert.deepEqual(validateInventory(before, new Map([["transactions.ts", hash("new")]])), target);
  const receipt = await runRepair(context, dependencies({
    validate: async () => { throw new Error("Unauthorized workspace change."); },
  }));
  assert.equal(receipt.finalStatus, "REJECTED");
  assert.equal(receipt.postRepair, undefined);
});
test("protected contract drift blocks repair authorization", async () => {
  let count = 0;
  const receipt = await runRepair(context, dependencies({
    integrity: async () => count++ === 0, repair: async () => assert.fail("must not authorize"),
  }));
  assert.equal(receipt.finalStatus, "REJECTED");
});
test("re-verification violation stops before additional scenarios", async () => {
  const receipt = await runRepair(context, dependencies({ observe: async (_, text) => browser(text, true) }));
  assert.equal(receipt.finalStatus, "FAILED");
  assert.equal(receipt.scenarios.length, 0);
});
test("source checks reject UI or external operations and detect unchanged broken behavior", async () => {
  const original = await seedSource(process.cwd());
  assert.throws(() => validateSource(original, original + "\nconsole.log('other change');"));
  assert.throws(() => validateSource(original, original.replace("validateTransfer(ledger, transaction);",
    "validateTransfer(ledger, transaction); document.write('fake');")));
  assert.throws(() => validateSource(original, original), /Transaction check failed/);
  const valid = original.replace("const { recipient, cents } = transaction;", "const { sender, recipient, cents } = transaction;")
    .replace("[recipient]: ledger.balances[recipient] + cents", "[sender]: ledger.balances[sender] - cents, [recipient]: ledger.balances[recipient] + cents");
  assert.doesNotThrow(() => validateSource(original, valid));
});
