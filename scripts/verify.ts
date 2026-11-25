import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanValue, evaluate, isRecord, type Observation } from "../src/invariants/evaluate";
import { execute, kaneCommand, watchdogSeconds } from "../src/kane/execute";
import { normalize } from "../src/kane/observations";
import { objectives, type ObjectiveName } from "../src/kane/objectives";
import { parseStream, workflowStatus } from "../src/kane/stream";

const root = ".invariant";
const records = join(root, "phase-1b-runs");
const lock = join(root, "verification-lock");
const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const privateFile = { flag: "wx", mode: 0o600 };

const centsByField = (observations: Record<string, Observation>) =>
  Object.fromEntries(Object.entries(observations).map(([field, observation]) => [
    field, { cents: cleanValue(field, observation.value), provenance: observation.provenance },
  ]));

async function replayHomepage(id: string, receipt: Record<string, unknown>) {
  if (receipt.executionId !== id || receipt.objective !== "observe" || receipt.workflow !== "PASSED" ||
      receipt.exitCode !== 0 || receipt.url !== "http://127.0.0.1:3000/" || !isRecord(receipt.evidence)) {
    throw new Error("The receipt is ineligible for homepage replay.");
  }
  const directory = join(records, id);
  const [stdout, stderr] = await Promise.all([readFile(join(directory, "stdout.ndjson")), readFile(join(directory, "stderr.txt"))]);
  const stdoutSha256 = sha256(stdout);
  if (stdoutSha256 !== receipt.evidence.stdoutSha256 || sha256(stderr) !== receipt.evidence.stderrSha256) {
    throw new Error("The captured streams differ from the original receipt.");
  }
  const parsed = parseStream(stdout.toString("utf8"));
  if (!parsed.complete || parsed.final?.status !== "passed" || parsed.fatalEvent) throw new Error("The captured run did not pass.");
  return normalize(objectives.observe.keys, parsed.final.final_state, id, stdoutSha256, receipt.url);
}

async function verify() {
  const name = process.argv[2];
  if (name === "revalidate-observe" && process.argv.length === 4) {
    const id = process.argv[3];
    if (id.length !== 36 || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) return 2;
    const directory = join(records, id);
    const receipt: unknown = JSON.parse(await readFile(join(directory, "receipt.json"), "utf8"));
    if (!isRecord(receipt)) return 2;
    const observations = await replayHomepage(id, receipt);
    const revised = { ...receipt, revalidatedFromRawEvidence: true, observationsStatus: "AVAILABLE",
      observationIssue: undefined, observations, normalizedCents: centsByField(observations) };
    await writeFile(join(directory, "revalidated-receipt.json"), json(revised), privateFile);
    console.log(json(revised).trimEnd());
    return 0;
  }
  if (!Object.hasOwn(objectives, name) || process.argv.length !== 3) {
    console.error("Usage: npm.cmd run verify -- observe|transfer|seeded-conservation");
    return 2;
  }
  const key = name as ObjectiveName;
  const objective = objectives[key];
  const command = await kaneCommand(process.env.KANE_CLI_EXECUTABLE ?? "");
  const url = "http://127.0.0.1:3000" + objective.path;
  const contractSha256 = sha256(await readFile("contracts/v1.json"));
  const objectiveSha256 = sha256(objective.objective);
  await mkdir(records, { recursive: true, mode: 0o700 });
  try { await mkdir(lock); } catch { throw new Error("The verification lock could not be acquired."); }
  try {
    const past = await readdir(records);
    if (past.length >= 3) throw new Error("The three-run budget is exhausted.");
    let credits = 0;
    let observedHomepage = false;
    let observedSeededTransfer = false;
    for (const run of past) {
      let receipt: unknown;
      try { receipt = JSON.parse(await readFile(join(records, run, "receipt.json"), "utf8")); }
      catch { throw new Error("A prior attempt has no complete receipt. Stop and inspect it."); }
      if (!isRecord(receipt) || ["TIMED_OUT", "AUTHENTICATION_ERROR", "INFRASTRUCTURE_ERROR", "INCOMPLETE"].includes(String(receipt.workflow)) ||
          typeof receipt.creditsConsumed !== "number" || !Number.isFinite(receipt.creditsConsumed) || receipt.creditsConsumed < 0) {
        throw new Error("A prior attempt has an infrastructure failure or unconfirmed credit consumption.");
      }
      credits += receipt.creditsConsumed;
      if (receipt.objective === "observe" && receipt.workflow === "PASSED") {
        try { await replayHomepage(run, receipt); observedHomepage = true; }
        catch { /* Ineligible captures cannot authorize a transfer. */ }
      }
      observedSeededTransfer ||= receipt.objective === "seeded-conservation" && receipt.observationsStatus === "AVAILABLE";
    }
    if (credits >= 300) throw new Error("The reported credit budget is exhausted.");
    if (key !== "observe" && !observedHomepage) throw new Error("Complete and inspect a read-only observation before running a transfer.");
    if (key === "transfer" && !observedSeededTransfer) throw new Error("Complete and inspect the seeded transfer first.");
    const id = randomUUID();
    const runDir = join(records, id);
    await mkdir(runDir, { mode: 0o700 });
    await writeFile(join(runDir, "attempt.json"), json({ id, url, objective: key, objectiveText: objective.objective,
      maxSteps: objective.maxSteps, timeoutSeconds: objective.timeoutSeconds, watchdogSeconds: watchdogSeconds(objective.timeoutSeconds),
      contractSha256, objectiveSha256 }), privateFile);
    const execution = await execute(command, { ...objective, url });
    const parsed = parseStream(execution.stdout);
    const workflow = workflowStatus(execution, parsed);
    const stdoutSha256 = sha256(execution.stdoutBytes);
    const stderrSha256 = sha256(execution.stderrBytes);
    await writeFile(join(runDir, "stdout.ndjson"), execution.stdoutBytes, privateFile);
    await writeFile(join(runDir, "stderr.txt"), execution.stderrBytes, privateFile);
    await writeFile(join(runDir, "execution.json"), json({
      exitCode: execution.exitCode, timedOut: execution.timedOut, launchError: execution.launchError,
      limitExceeded: execution.limitExceeded, streamsClosed: execution.streamsClosed, final: parsed.final,
    }), privateFile);

    let observations: Record<string, Observation> | undefined;
    let observationIssue: string | undefined;
    if (workflow === "PASSED") {
      try { observations = normalize(objective.keys, parsed.final?.final_state, id, stdoutSha256, url); }
      catch (error) { observationIssue = error instanceof Error ? error.message : "Invalid observation."; }
    } else {
      observationIssue = "Workflow did not complete successfully. Browser values are ineligible.";
    }
    const verdict = objective.contractId ? evaluate(objective.contractId, observations, id) : null;
    if (verdict?.status === "INCONCLUSIVE" && observationIssue) verdict.explanation = observationIssue;
    const creditsConsumed = parsed.final?.credits_consumed ?? (execution.exitCode === 2 && !parsed.final ? 0 : null);
    const receipt = {
      schemaVersion: 1, source: "kane", executionId: id, cliVersion: parsed.cliVersion,
      objective: key, url, seededDefect: key === "seeded-conservation",
      timestamp: parsed.final?.ts ?? new Date().toISOString(),
      workflow, exitCode: execution.exitCode, completedSteps: parsed.completedSteps, durationSeconds: parsed.final?.duration ?? null,
      observationsStatus: observations ? "AVAILABLE" : "UNAVAILABLE", observationIssue, observations,
      normalizedCents: observations && centsByField(observations),
      repairAuthorization: "NOT_AUTHORIZED", verification: verdict?.status ?? "NOT_APPLICABLE", verdict,
      creditsConsumed, cumulativeReportedCredits: creditsConsumed === null ? null : credits + creditsConsumed,
      evidence: { stdoutSha256, stderrSha256, contractSha256, objectiveSha256 },
    };
    await writeFile(join(runDir, "receipt.json"), json(receipt), privateFile);
    console.log(json(receipt).trimEnd());
    return !observations || verdict?.status === "INCONCLUSIVE" ? 2 : verdict?.status === "VIOLATED" ? 1 : 0;
  } finally {
    await rmdir(lock);
  }
}

verify().then((code) => { process.exitCode = code; }).catch(() => {
  console.error("Verification stopped before a receipt could be produced. Check the executable, local run budget, and any unfinished attempt under .invariant/phase-1b-runs.");
  process.exitCode = 2;
});
