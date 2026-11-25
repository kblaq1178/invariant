import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate } from "../src/invariants/evaluate";
import { normalize } from "../src/kane/observations";
import { execute, kaneCommand, watchdogSeconds } from "../src/kane/execute";
import { objectives } from "../src/kane/objectives";
import { parseStream, workflowStatus } from "../src/kane/stream";
import { dollars, parseDollars } from "../src/ledger/money";
import { corrected, initialLedger, type Transaction, type TransactionLogic } from "../src/ledger/transactions";
import { conservationDefect } from "../src/ledger/fixtures/conservation";
import { idempotencyDefect } from "../src/ledger/fixtures/idempotency";

const transaction: Transaction = { id: "12345678-abcd-1234-abcd-123456789012", sender: "A", recipient: "B", cents: 10000 };
const executionId = "synthetic-unit-only";
const hash = "a".repeat(64);
const before = initialLedger();

function conservation(logic: TransactionLogic) {
  const after = logic.transfer(before, transaction);
  const data = { before_sender: dollars(before.balances.A), before_recipient: dollars(before.balances.B),
    after_sender: dollars(after.balances.A), after_recipient: dollars(after.balances.B) };
  return normalize(objectives.transfer.keys, data, executionId, hash);
}
function retry(logic: TransactionLogic) {
  const posted = logic.transfer(before, transaction);
  const retried = logic.retry(posted, transaction.id);
  return normalize(["before_sender", "before_recipient", "after_sender", "after_recipient", "before_count", "after_count", "transaction_id", "retried_id"], {
    before_sender: dollars(posted.balances.A), before_recipient: dollars(posted.balances.B),
    after_sender: dollars(retried.balances.A), after_recipient: dollars(retried.balances.B),
    before_count: String(posted.history.length), after_count: String(retried.history.length),
    transaction_id: transaction.id, retried_id: transaction.id,
  }, executionId, hash);
}

test("corrected transfer preserves 150000 cents", () => {
  const verdict = evaluate("INV-001", conservation(corrected), executionId);
  assert.equal(verdict.status, "SATISFIED");
  assert.deepEqual([verdict.expected, verdict.observed, verdict.difference], [150000, 150000, 0]);
});
test("seeded conservation fixture adds 10000 cents and logs success", () => {
  const ledger = conservationDefect.transfer(before, transaction);
  assert.deepEqual(ledger.balances, { A: 100000, B: 60000 });
  assert.equal(ledger.history[0].id, transaction.id);
  const verdict = evaluate("INV-001", conservation(conservationDefect), executionId);
  assert.equal(verdict.status, "VIOLATED");
  assert.equal(verdict.difference, 10000);
});
test("corrected retry preserves balances and count", () => {
  assert.equal(evaluate("INV-002", retry(corrected), executionId).status, "SATISFIED");
});
test("seeded idempotency fixture double-posts with a distinct ledger entry", () => {
  const posted = idempotencyDefect.transfer(before, transaction);
  const retried = idempotencyDefect.retry(posted, transaction.id);
  assert.notEqual(retried.history[0].id, retried.history[1].id);
  const verdict = evaluate("INV-002", retry(idempotencyDefect), executionId);
  assert.equal(verdict.status, "VIOLATED");
  assert.deepEqual(verdict.difference, [-10000, 10000, 1, null]);
});
test("corrected duplicate transfer replay and failed transfer are atomic", () => {
  const posted = corrected.transfer(before, transaction);
  assert.strictEqual(corrected.transfer(posted, transaction), posted);
  assert.throws(() => corrected.transfer(posted, { ...transaction, cents: 1 }), /identifier/i);
  assert.throws(() => corrected.transfer(posted, { ...transaction, id: "another", cents: 100000 }), /Insufficient/);
  assert.deepEqual(posted.balances, { A: 90000, B: 60000 });
});
test("missing, unexpected, and cross-run observations are inconclusive", () => {
  const full = conservation(corrected);
  const { before_sender, ...missing } = full;
  assert.equal(evaluate("INV-001", missing, executionId).status, "INCONCLUSIVE");
  assert.equal(evaluate("INV-001", { ...full, extra: before_sender }, executionId).status, "INCONCLUSIVE");
  before_sender.provenance.executionId = "other";
  assert.equal(evaluate("INV-001", full, executionId).status, "INCONCLUSIVE");
});

test("Kane metadata is excluded while required named fields and page identity are validated", () => {
  const url = "http://127.0.0.1:3000/";
  const state = { url, currency_text: "USD", initial_sender: "$1,000.00", initial_recipient: "$500.00" };
  assert.deepEqual(Object.keys(normalize(objectives.observe.keys, state, executionId, hash, url)), objectives.observe.keys);
  assert.throws(() => normalize(objectives.observe.keys, { ...state, initial_recipient: undefined }, executionId, hash, url));
  assert.throws(() => normalize(objectives.observe.keys, { ...state, url: url + "different" }, executionId, hash, url), /different final page/);
});
test("retry for a different identifier is inconclusive", () => {
  const observations = retry(corrected);
  observations.retried_id.value = "22345678-abcd-1234-abcd-123456789012";
  assert.equal(evaluate("INV-002", observations, executionId).status, "INCONCLUSIVE");
});
test("planned contracts remain inconclusive", () => {
  for (const id of ["INV-003", "INV-004", "INV-005"] as const) {
    assert.equal(evaluate(id, conservation(corrected), executionId).status, "INCONCLUSIVE");
  }
});
test("money parser handles cents and rejects malformed or unsafe values", () => {
  assert.equal(parseDollars("100.01"), 10001);
  assert.equal(parseDollars("$90,071,992,547,409.91", true), Number.MAX_SAFE_INTEGER);
  assert.equal(dollars(Number.MAX_SAFE_INTEGER), "$90,071,992,547,409.91");
  for (const value of ["$01.00", "$1000.00", "$1,00.00", "$1.000", "$1.00\n", "$1e2", "$90,071,992,547,409.92", 100]) {
    assert.throws(() => parseDollars(value, true));
  }
  assert.throws(() => normalize(["initial_sender"], { initial_sender: { value: "$1.00" } }, executionId, hash));
});
test("unsafe sums and deltas produce inconclusive verdicts", () => {
  const data = conservation(corrected);
  data.before_sender.value = dollars(Number.MAX_SAFE_INTEGER);
  assert.equal(evaluate("INV-001", data, executionId).status, "INCONCLUSIVE");
  data.before_recipient.value = "$0.00";
  data.after_sender.value = dollars(-Number.MAX_SAFE_INTEGER);
  data.after_recipient.value = "$0.00";
  assert.match(evaluate("INV-001", data, executionId).explanation, /safe integer/);
});

// Synthetic NDJSON fixtures. These exercise the parser and are never stored as browser evidence.
const line = (event: object) => JSON.stringify({ ...event, v: 1, ts: "2026-11-25T12:00:00.000Z" });
const start = line({ type: "stream_start", surface: "run" });
const end = line({ type: "run_end", status: "passed", final_state: { initial_sender: "$1,000.00" }, credits_consumed: 1.5 });
const stream = [start, end].join("\n");
const processResult = { exitCode: 0, timedOut: false, launchError: false, limitExceeded: false, stderr: "", stdout: stream };
test("accepts a single valid terminal event", () => {
  assert.equal(workflowStatus(processResult, parseStream(stream)), "PASSED");
});
test("duplicate and malformed terminal events fail closed", () => {
  for (const body of [stream + "\n" + end, start + "\n" + line({ type: "run_end", status: "other" }),
    start + "\n" + line({ type: "run_end", status: "passed", final_state: [] }),
    start + "\n" + end.replace('"initial_sender":', '"initial_sender":"$0.00","initial_sender":')]) {
    assert.equal(parseStream(body).complete, false);
  }
});
test("interrupted output and unexpected trailing data are incomplete", () => {
  for (const body of [start, stream.slice(0, -2), stream + "\ninterrupted"]) {
    assert.equal(workflowStatus(processResult, parseStream(body)), "INCOMPLETE");
  }
});
test("infrastructure, authentication, timeout and failed workflows cannot pass with observations", () => {
  const parsed = parseStream(stream);
  assert.equal(workflowStatus({ ...processResult, launchError: true }, parsed), "INFRASTRUCTURE_ERROR");
  assert.equal(workflowStatus({ ...processResult, limitExceeded: true }, parsed), "INFRASTRUCTURE_ERROR");
  assert.equal(workflowStatus({ ...processResult, exitCode: 2, stderr: "Not logged in" }, parsed), "AUTHENTICATION_ERROR");
  assert.equal(workflowStatus({ ...processResult, exitCode: 3 }, parsed), "TIMED_OUT");
  assert.equal(workflowStatus({ ...processResult, timedOut: true }, parsed), "TIMED_OUT");
  assert.equal(workflowStatus({ ...processResult, exitCode: 1 }, parsed), "FAILED");
});
test("command resolution and execution reject unapproved and non-loopback inputs before spawn", async () => {
  await assert.rejects(kaneCommand("kane-cli.cmd"), /absolute/);
  assert.throws(() => execute({ executable: "never-used", prefix: [] }, {
    url: "https://example.com", objective: "Read balances", maxSteps: 8, timeoutSeconds: 10,
  }), /loopback/);
});

test("adapter drains stdout through child close and retains separately streamed stderr", async () => {
  const received: string[] = [];
  const command = { executable: process.execPath, prefix: ["-e",
    "process.stderr.write('diagnostic'); process.stdout.write(process.argv[1]); setTimeout(() => process.stdout.end(process.argv[2]), 20)",
    "--", start + "\n", end] };
  const result = await execute(command, { url: "http://127.0.0.1:3000/", objective: "Unit test",
    maxSteps: 10, timeoutSeconds: 240 }, (channel, chunk) => {
    if (channel === "stdout") received.push(chunk.toString());
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.streamsClosed, true);
  assert.equal(result.timedOut, false);
  assert.equal(result.stdout, stream);
  assert.equal(received.join(""), stream);
  assert.equal(result.stderr, "diagnostic");
  assert.equal(watchdogSeconds(240), 300);
});
