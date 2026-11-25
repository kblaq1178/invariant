import assert from "node:assert/strict";
import { test } from "node:test";
import ledger from "../examples/ledgerlab.project.json";
import stock from "../examples/inventory.project.json";
import fixture from "../examples/inventory.deterministic-fixture.json";
import { applicationUrl, evaluateProject, exportProject, importProject, parseProject, readProjectJson } from "../src/projects/config";
import { readProjectExecution } from "../src/projects/kane";

const project = parseProject(stock);

test("project JSON import/export validates version, fields and independently named sides", () => {
  assert.deepEqual(importProject(exportProject(project)), project);
  for (const invalid of [
    { ...stock, schemaVersion: 2 }, { ...stock, command: "arbitrary" },
    { ...stock, objective: "Read a balance." }, { ...stock, observations: ["constructor", "counted_units"] },
    { ...stock, contract: { ...stock.contract, right: ["recorded_units"] } },
    { ...stock, contract: { ...stock.contract, operator: "arbitrary function" } },
  ]) assert.throws(() => parseProject(invalid));
  assert.throws(() => importProject(exportProject(project).replace('{', '{"schemaVersion":2,')), /Duplicate/);
  assert.throws(() => readProjectJson('{"recorded_units":2,"recorded_\u0075nits":1}'), /Duplicate/);
  assert.throws(() => readProjectJson('{"recorded_units":9007199254740990.5}'), /safe integers/);
  assert.deepEqual(importProject("\uFEFF" + exportProject(project)), project);
});

test("application URLs are absolute loopback HTTP(S) without ambiguous authority or secrets", () => {
  assert.equal(applicationUrl("http://localhost:9090/inventory"), "http://localhost:9090/inventory");
  assert.equal(applicationUrl("http://[::1]:9090/"), "http://[::1]:9090/");
  for (const url of [
    "https://example.com/", "http://user@example.com/", "http://user@localhost/", "http://localhost/?",
    "http://localhost/#x", "http://localhost\\bad", "file:///tmp/x", "http://2130706433/", "http://127.1/", "http://localhost.example.com/",
  ]) assert.throws(() => applicationUrl(url));
});

test("explicitly imported deterministic inventory fixture produces a violation, independently of LedgerLab", () => {
  const result = evaluateProject(project, fixture);
  assert.equal(result.status, "VIOLATED");
  assert.deepEqual([result.expected, result.observed, result.difference], [240, 238, -2]);
  assert.equal(evaluateProject(project, { recorded_units: "240", counted_units: 240 }).status, "SATISFIED");
  assert.equal("provenance" in result, false);
});

test("conservation uses integer cents and fails closed on missing, malformed or unsafe arithmetic", () => {
  const spec = parseProject(ledger);
  const values = { before_sender: "$1,000.00", before_recipient: "$500.00", after_sender: "$900.00", after_recipient: "$600.00" };
  assert.equal(evaluateProject(spec, values).status, "SATISFIED");
  const more = { ...values, after_sender: "$1,000.00" };
  assert.deepEqual([evaluateProject(spec, more).status, evaluateProject(spec, more).difference], ["VIOLATED", 10000]);
  assert.equal(evaluateProject(spec, { ...values, before_sender: "$90,071,992,547,409.91" }).status, "INCONCLUSIVE");
  for (const observations of [null, { recorded_units: 5 }, { ...fixture, counted_units: "2.4" },
    { ...fixture, counted_units: 9007199254740992 }, { ...fixture, counted_units: "238\n" },
    { recorded_units: Number.MAX_SAFE_INTEGER, counted_units: Number.MIN_SAFE_INTEGER }, { ...fixture, unexpected: 7 }]) {
    assert.equal(evaluateProject(project, observations).status, "INCONCLUSIVE");
  }
});

test("synthetic terminal capture tests fail-closed workflow and target provenance checks", () => {
  const start = { v: 1, type: "stream_start", surface: "run" };
  const end = { v: 1, type: "run_end", status: "passed", ts: "2026-11-25T16:00:00.000Z",
    final_state: { ...fixture, url: project.url, ancillary: "ignored" } };
  const capture = (stdout: string, exitCode = 0) => ({
    stdout, stderr: "", stdoutBytes: Buffer.from(stdout), stderrBytes: Buffer.alloc(0), streamsClosed: true,
    exitCode, timedOut: false, limitExceeded: false, launchError: false,
  });
  const lines = (...events: object[]) => events.map((event) => JSON.stringify(event)).join("\n");
  assert.equal(readProjectExecution(project, capture(lines(start, end))).verdict.status, "VIOLATED");
  assert.equal(readProjectExecution(project, capture(lines(start, end), 1)).verdict.status, "INCONCLUSIVE");
  assert.equal(readProjectExecution(project, capture(lines(start, end, end))).verdict.status, "INCONCLUSIVE");
  assert.equal(readProjectExecution(project, capture(lines(start, { ...end, final_state: { ...fixture, counted_units: 238 } }))).verdict.status, "INCONCLUSIVE");
  assert.equal(readProjectExecution(project, capture(lines(start, { ...end, final_state: { ...fixture, url: "http://localhost:9999/" } }))).verdict.status, "INCONCLUSIVE");
});
