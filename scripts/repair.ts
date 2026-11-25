import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { evaluate, isRecord } from "../src/invariants/evaluate";
import { execute, kaneCommand } from "../src/kane/execute";
import { normalize } from "../src/kane/observations";
import { objectives } from "../src/kane/objectives";
import { parseStream, workflowStatus } from "../src/kane/stream";
import { codexCommand, probeSandbox, repairWithCodex } from "../src/repair/codex";
import { runRepair, type BrowserEvidence } from "../src/repair/loop";
import { hash, inventory, validateInventory, validateSource } from "../src/repair/patch";
import { repairPath, seedSource, startTarget, targetUrl } from "../src/repair/target";
import { runProcess } from "../src/runtime/process";

const root = resolve(".invariant");
const records = join(root, "phase-2-runs");
const lock = join(root, "verification-lock");
const budgetFile = join(root, "phase-2-budget.json");
const amounts = new Map([[10_000, "100.00"], [1_000, "10.00"], [25_000, "250.00"]]);
const objectiveFor = (amount: number) => {
  const dollars = amounts.get(amount);
  if (!dollars) throw new Error("Unsupported scenario amount.");
  return objectives.transfer.objective.replace("100.00", dollars);
};
const protectedPaths = [
  "contracts/v1.json", "src/invariants/evaluate.ts", "src/kane/objectives.ts", "src/kane/execute.ts",
  "src/kane/stream.ts", "src/kane/observations.ts", "src/runtime/process.ts", "src/ledger/money.ts",
  "src/ledger/transactions.ts", "src/ledger/fixtures/conservation.ts", "src/ledger/fixtures/idempotency.ts",
  "app/ledger-lab.tsx", "scripts/repair.ts", "src/repair/target.ts", "src/repair/codex.ts", "src/repair/loop.ts",
  "src/repair/patch.ts", "tests/phase1.test.ts", "tests/repair.test.ts",
];
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const save = (directory: string, name: string, data: string | Buffer) => writeFile(join(directory, name), data, { mode: 0o600, flag: "wx" });
const goodProcess = (process: Awaited<ReturnType<typeof runProcess>>) =>
  process.streamsClosed && !process.timedOut && !process.limitExceeded && !process.launchError;
const minimalId = (value: unknown, pattern: RegExp) => typeof value === "string" && value.length <= 64 && pattern.test(value) ? value : undefined;

async function main() {
  const probeOnly = process.argv[2] === "--probe";
  const retryId = process.argv[2] === "--retry-validation" ? process.argv[3] : undefined;
  if (process.argv.length !== (probeOnly ? 3 : retryId ? 4 : 2) ||
      (retryId && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(retryId))) {
    throw new Error("Usage: npm.cmd run repair -- [--probe|--retry-validation <run-id>]");
  }
  const repository = await realpath(process.cwd());
  const codex = await codexCommand(process.env.CODEX_EXECUTABLE ?? "");
  const id = randomUUID();
  const evidence = join(records, id);
  await mkdir(records, { recursive: true });
  await mkdir(lock);
  try {
    await mkdir(evidence);
    const workspace = await realpath(await mkdtemp(join(tmpdir(), "invariant-repair-")));
    const original = await seedSource(repository);
    await save(workspace, repairPath, original);
    const before = await inventory(workspace);
    const objective = objectiveFor(10_000);
    const snapshotSha256 = hash(json(Object.fromEntries(before)));
    const protectedHashes = Object.fromEntries(await Promise.all(protectedPaths.map(async (path) =>
      [path, hash(await readFile(join(repository, path)))] as const)));
    const contractSha256 = protectedHashes["contracts/v1.json"];
    const objectiveSha256 = hash(objective);
    const objectiveHashes = Object.fromEntries([...amounts.keys()].map((amount) => [amount, hash(objectiveFor(amount))]));
    await save(evidence, "workspace.json", json({ id, workspace, targetUrl, snapshotSha256, initialFiles: Object.fromEntries(before),
      allowedPaths: [repairPath], protectedHashes, contractSha256, objectiveSha256, objectiveHashes }));
    const probe = await probeSandbox(codex, repository, workspace);
    await save(evidence, "sandbox-probe.stdout.txt", probe.result.stdoutBytes);
    await save(evidence, "sandbox-probe.stderr.txt", probe.result.stderrBytes);
    const sandbox = { verified: probe.verified, exitCode: probe.result.exitCode, timedOut: probe.result.timedOut,
      stdoutSha256: hash(probe.result.stdoutBytes), stderrSha256: hash(probe.result.stderrBytes) };
    if (!probe.verified || probeOnly) {
      const status = probe.verified ? "READY" : "FAILED";
      const result = { schemaVersion: 1, runId: id, defectOrigin: "SEEDED_BENCHMARK", contractId: "INV-001", contractSha256,
        objectiveSha256, snapshotSha256, sandbox, finalStatus: status, creditsConsumed: 0, reason: probe.verified ?
          "Filesystem preflight completed." : "Codex filesystem read/write isolation could not be established." };
      await save(evidence, "receipt.json", json(result));
      console.log(json(result));
      return probe.verified ? 0 : 2;
    }
    const kane = await kaneCommand(process.env.KANE_CLI_EXECUTABLE ?? "");
    let budget = { runs: 0, credits: 0, repairs: 0, unresolved: false };
    try {
      const value: unknown = JSON.parse(await readFile(budgetFile, "utf8"));
      if (!isRecord(value) || !Number.isSafeInteger(value.runs) || !Number.isSafeInteger(value.repairs) ||
          typeof value.credits !== "number" || !Number.isFinite(value.credits) || value.credits < 0 || typeof value.unresolved !== "boolean") {
        throw new Error("Invalid Phase 2 budget.");
      }
      budget = { runs: value.runs as number, credits: value.credits, repairs: value.repairs as number, unresolved: value.unresolved };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const persistBudget = () => writeFile(budgetFile, json(budget), { mode: 0o600 });
    if (retryId) {
      const priorDir = join(records, retryId);
      const prior: unknown = JSON.parse(await readFile(join(priorDir, "receipt.json"), "utf8"));
      if (!budget.unresolved || budget.runs !== 1 || budget.repairs !== 1 || !isRecord(prior) ||
          prior.runId !== retryId || prior.finalStatus !== "REJECTED" || prior.snapshotSha256 !== snapshotSha256 ||
          prior.contractSha256 !== contractSha256 || prior.objectiveSha256 !== objectiveSha256 ||
          prior.creditsConsumed !== budget.credits || !isRecord(prior.repair) || prior.repair.completed !== true ||
          !isRecord(prior.initial) || prior.initial.workflow !== "PASSED" ||
          !isRecord(prior.initial.verdict) || prior.initial.verdict.status !== "VIOLATED") {
        throw new Error("Prior run is ineligible for a validator recovery.");
      }
      const [baseline, candidate, codexStdout, priorDiff] = await Promise.all(
        ["before.ts.txt", "candidate.ts.txt", "codex.stdout.ndjson", "repair.diff"].map((file) => readFile(join(priorDir, file))));
      if (baseline.toString("utf8") !== original || hash(codexStdout) !== prior.repair.stdoutSha256 ||
          hash(candidate) === hash(baseline)) throw new Error("Prior validation artifacts conflict.");
      // These artifacts are sealed only after the original inventory gate passes.
      // Require the repaired validator to accept them before opening a new run.
      validateSource(original, candidate.toString("utf8"));
      await save(evidence, "retry-validation.json", json({ priorRunId: retryId, priorDiffSha256: hash(priorDiff),
        candidateSha256: hash(candidate), retainedBudget: budget }));
      budget.unresolved = false;
      await persistBudget();
    }
    if (budget.unresolved || budget.runs + 4 > 6 || budget.repairs >= 2 || budget.credits >= 500) throw new Error("Phase 2 budget unavailable.");

    const server = await startTarget(await readFile(join(repository, "src/ledger/money.ts"), "utf8"), original);
    try {
      const result = await runRepair({
        runId: id, objective, contractSha256, objectiveSha256, snapshotSha256, protectedHashes, allowedPaths: [repairPath],
      }, {
        scenarioObjective: objectiveFor,
        event(event) {
          appendFileSync(join(evidence, "events.ndjson"), JSON.stringify(event) + "\n", { mode: 0o600 });
          console.log(JSON.stringify(event));
        },
        async integrity() {
          return hash(objectiveFor(10_000)) === objectiveSha256 &&
            (await Promise.all(Object.entries(protectedHashes).map(async ([path, digest]) =>
              hash(await readFile(join(repository, path))) === digest))).every(Boolean);
        },
        async observe(amount, text): Promise<BrowserEvidence> {
          if (budget.unresolved || budget.runs >= 6 || budget.credits >= 500 || hash(text) !== objectiveHashes[amount]) {
            throw new Error("Verification budget or objective rejected.");
          }
          const executionId = randomUUID();
          const directory = join(evidence, executionId);
          await mkdir(directory);
          await save(directory, "attempt.json", json({ amount, executionId, objective: text, targetUrl }));
          budget.runs += 1;
          budget.unresolved = true;
          await persistBudget();
          const execution = await execute(kane, { url: targetUrl, objective: text, maxSteps: 18, timeoutSeconds: 240 });
          const parsed = parseStream(execution.stdout);
          const workflow = workflowStatus(execution, parsed);
          const stdoutSha256 = hash(execution.stdoutBytes);
          const stderrSha256 = hash(execution.stderrBytes);
          await save(directory, "stdout.ndjson", execution.stdoutBytes);
          await save(directory, "stderr.txt", execution.stderrBytes);
          await save(directory, "execution.json", json({ exitCode: execution.exitCode, streamsClosed: execution.streamsClosed,
            timedOut: execution.timedOut, final: parsed.final }));
          const creditsConsumed = parsed.final?.credits_consumed ?? null;
          if (creditsConsumed !== null) budget.credits += creditsConsumed;
          budget.unresolved = creditsConsumed === null || ["TIMED_OUT", "AUTHENTICATION_ERROR", "INFRASTRUCTURE_ERROR", "INCOMPLETE"].includes(workflow);
          await persistBudget();
          let observations;
          if (workflow === "PASSED" && execution.streamsClosed) {
            try { observations = normalize(objectives.transfer.keys, parsed.final?.final_state, executionId, stdoutSha256, targetUrl); }
            catch { /* The evaluator records ineligible evidence as inconclusive. */ }
          }
          const sessionId = minimalId(parsed.final?.session_dir?.split(/[\\/]/).at(-1), /^[a-f0-9-]{36}$/i);
          const terminal: unknown = parsed.final;
          const kaneRunId = isRecord(terminal) ? minimalId(terminal.run_id, /^run-\d+$/) : undefined;
          const result = { executionId, workflow, observations, creditsConsumed, stdoutSha256, stderrSha256, contractSha256,
            objectiveSha256: hash(text), sessionId, kaneRunId };
          await save(directory, "receipt.json", json({ ...result, verdict: evaluate("INV-001", observations, executionId) }));
          return result;
        },
        async repair(packet) {
          if (budget.unresolved || budget.repairs >= 2 || budget.credits >= 500) throw new Error("Repair budget exhausted.");
          budget.repairs += 1;
          budget.unresolved = true;
          await persistBudget();
          await save(evidence, "repair-packet.json", packet);
          const { result, durationMs, completed } = await repairWithCodex(codex, repository, workspace, packet);
          await save(evidence, "codex.stdout.ndjson", result.stdoutBytes);
          await save(evidence, "codex.stderr.txt", result.stderrBytes);
          budget.unresolved = !completed;
          await persistBudget();
          return { completed, durationMs, timedOut: result.timedOut, exitCode: result.exitCode,
            stdoutSha256: hash(result.stdoutBytes), stderrSha256: hash(result.stderrBytes) };
        },
        async validate() {
          const changedFiles = validateInventory(before, await inventory(workspace));
          const candidate = await readFile(join(workspace, repairPath), "utf8");
          await save(evidence, "before.ts.txt", original);
          await save(evidence, "candidate.ts.txt", candidate);
          const diff = await runProcess("git", ["--no-pager", "diff", "--no-index", "--no-ext-diff", "--no-textconv", "--",
            "before.ts.txt", "candidate.ts.txt"], { cwd: evidence, timeoutMs: 15_000 });
          if (!goodProcess(diff) || diff.exitCode !== 1 || !diff.stdout.startsWith("diff --git ")) throw new Error("Source diff unavailable.");
          await save(evidence, "repair.diff", diff.stdoutBytes);
          validateSource(original, candidate);
          server.replace(candidate);
          return { changedFiles, diff: diff.stdout, diffSha256: hash(diff.stdoutBytes), localChecks: "PASSED" };
        },
      });
      if (result.finalStatus !== "VERIFIED") {
        budget.unresolved = true;
        await persistBudget();
      }
      const receipt = { ...result, sandbox, stageCounts: budget };
      await save(evidence, "receipt.json", json(receipt));
      console.log(json(receipt));
      return result.finalStatus === "VERIFIED" ? 0 : 2;
    } finally {
      server.close();
      // Quarantine the agent's artifacts. Only the validated in-memory source
      // was eligible for serving. Reset the disposable source when safe.
      try {
        const current = await inventory(workspace);
        if (current.size === 1 && current.has(repairPath)) await writeFile(join(workspace, repairPath), original);
      } catch { /* Untrusted filesystem entries are left quarantined and never served. */ }
    }
  } finally {
    await rmdir(lock);
  }
}
main().then((code) => { process.exitCode = code; }).catch(() => {
  console.error("Phase 2 did not start or stopped while saving local execution data. Inspect the private run directory.");
  process.exitCode = 2;
});
