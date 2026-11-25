import { evaluate, isRecord, type Observation } from "../invariants/evaluate";
import { objectives } from "../kane/objectives";

export const sections = ["overview", "projects", "contracts", "executions", "repairs", "evidence", "sandbox"] as const;
export type Section = typeof sections[number];
export type Mode = "local" | "demo";

const lifecycle = {
  READY: ["OBSERVING", "FAILED"], OBSERVING: ["EVALUATING", "INCONCLUSIVE", "FAILED"],
  EVALUATING: ["VIOLATION_DETECTED", "INCONCLUSIVE", "FAILED"], VIOLATION_DETECTED: ["REPAIR_AUTHORIZED", "REJECTED", "FAILED"],
  REPAIR_AUTHORIZED: ["REPAIRING", "FAILED"], REPAIRING: ["VALIDATING_PATCH", "FAILED", "REJECTED"],
  VALIDATING_PATCH: ["REVERIFYING", "REJECTED", "FAILED"], REVERIFYING: ["VERIFIED", "INCONCLUSIVE", "FAILED"],
  VERIFIED: [], INCONCLUSIVE: [], REJECTED: [], FAILED: [],
} as const;
type State = keyof typeof lifecycle;
const terminal = ["VERIFIED", "INCONCLUSIVE", "REJECTED", "FAILED"] as const;
const browserStatuses = ["PASSED", "FAILED", "TIMED_OUT", "INCOMPLETE", "AUTHENTICATION_ERROR", "INFRASTRUCTURE_ERROR"] as const;
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const fail = (): never => { throw new Error("The file is not a valid Invariant Phase 2 receipt."); };
const record = (value: unknown) => isRecord(value) ? value : fail();
const digest = (value: unknown): string => typeof value === "string" && value.length === 64 && hashPattern.test(value) ? value : fail();
const uuid = (value: unknown): string => typeof value === "string" && value.length === 36 && uuidPattern.test(value) ? value : fail();
const number = (value: unknown, integer = false): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && (!integer || Number.isSafeInteger(value)) ? value : fail();
const date = (value: unknown): string => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value))) return fail();
  return new Date(value).toISOString() === value ? value : fail();
};
const known = <T extends string>(values: readonly T[], value: unknown): T =>
  typeof value === "string" && values.includes(value as T) ? value as T : fail();
const singlePath = (value: unknown) => Array.isArray(value) && value.length === 1 && value[0] === "transactions.ts" ? ["transactions.ts"] : fail();

function browser(value: unknown, contractSha256: string, objectiveSha256?: string) {
  const item = record(value);
  const executionId = uuid(item.executionId);
  const workflow = known(browserStatuses, item.workflow);
  const stdoutSha256 = digest(item.stdoutSha256);
  if (digest(item.contractSha256) !== contractSha256 || (objectiveSha256 && item.objectiveSha256 !== objectiveSha256)) return fail();
  let observations: Record<string, Observation> | undefined;
  if (item.observations !== undefined) {
    const original = record(item.observations);
    if (Object.keys(original).length !== objectives.transfer.keys.length) return fail();
    observations = Object.fromEntries(objectives.transfer.keys.map((key) => {
      const entry = record(original[key]);
      const provenance = record(entry.provenance);
      if (provenance.source !== "kane" || provenance.executionId !== executionId || provenance.field !== key ||
          provenance.stdoutSha256 !== stdoutSha256 || typeof entry.value !== "string") return fail();
      return [key, { value: entry.value, provenance: { source: "kane" as const, executionId, field: key, stdoutSha256 } }];
    }));
  }
  const result = evaluate("INV-001", workflow === "PASSED" ? observations : undefined, executionId);
  const verdict = record(item.verdict);
  if (verdict.contractId !== "INV-001" || verdict.executionId !== executionId || verdict.status !== result.status ||
      (result.status !== "INCONCLUSIVE" && (verdict.expected !== result.expected || verdict.observed !== result.observed ||
        verdict.difference !== result.difference)) || (observations && result.status === "INCONCLUSIVE")) return fail();
  return {
    executionId, workflow, stdoutSha256, stderrSha256: digest(item.stderrSha256), contractSha256,
    objectiveSha256: digest(item.objectiveSha256), observations,
    sessionId: item.sessionId === undefined ? undefined : uuid(item.sessionId),
    kaneRunId: typeof item.kaneRunId === "string" && /^run-\d{1,8}$/.test(item.kaneRunId) ? item.kaneRunId : undefined,
    creditsConsumed: item.creditsConsumed === null ? null : number(item.creditsConsumed),
    verdict: { ...result, timestamp: date(verdict.timestamp) },
  };
}

export function parseReceipt(input: unknown, expectedContractSha256: string, expectedObjectiveSha256: string,
  scenarioHashes: Record<number, string>) {
  const root = record(input);
  if (root.schemaVersion !== 1 || root.contractId !== "INV-001" || root.defectOrigin !== "SEEDED_BENCHMARK" ||
      digest(root.contractSha256) !== expectedContractSha256 || digest(root.objectiveSha256) !== expectedObjectiveSha256 ||
      root.objective !== objectives.transfer.objective) return fail();
  const runId = uuid(root.runId);
  const finalStatus = known(terminal, root.finalStatus);
  const allowedPaths = singlePath(root.allowedPaths);
  if (record(root.protectedHashes)["contracts/v1.json"] !== expectedContractSha256) return fail();
  if (!Array.isArray(root.events) || root.events.length < 2 || root.events.length > 12) return fail();
  const events = root.events.map((entry) => {
    const event = record(entry);
    if (event.runId !== runId || typeof event.state !== "string" || !Object.hasOwn(lifecycle, event.state)) return fail();
    return { runId, state: event.state as State, at: date(event.at) };
  });
  if (events[0].state !== "READY" || events.at(-1)?.state !== finalStatus || events.some((event, index) =>
    index > 0 && (!(lifecycle[events[index - 1].state] as readonly State[]).includes(event.state) ||
      Date.parse(event.at) < Date.parse(events[index - 1].at)))) return fail();

  const initial = root.initial === undefined ? undefined : browser(root.initial, expectedContractSha256, expectedObjectiveSha256);
  const postRepair = root.postRepair === undefined ? undefined : browser(root.postRepair, expectedContractSha256, expectedObjectiveSha256);
  if (!Array.isArray(root.scenarios) || root.scenarios.length > 2) return fail();
  const scenarios = root.scenarios.map((entry) => {
    const scenario = record(entry);
    if (scenario.amountCents !== 1000 && scenario.amountCents !== 25000) return fail();
    return { amountCents: scenario.amountCents,
      result: browser(scenario.result, expectedContractSha256, scenarioHashes[scenario.amountCents]) };
  });
  const rawRepair = root.repair === undefined ? undefined : record(root.repair);
  const repair = rawRepair && {
    completed: rawRepair.completed === true, timedOut: rawRepair.timedOut === true,
    exitCode: rawRepair.exitCode === null ? null : number(rawRepair.exitCode, true), durationMs: number(rawRepair.durationMs, true),
    stdoutSha256: digest(rawRepair.stdoutSha256), stderrSha256: digest(rawRepair.stderrSha256),
  };
  const rawPatch = root.patch === undefined ? undefined : record(root.patch);
  const patch = rawPatch && { changedFiles: singlePath(rawPatch.changedFiles), diffSha256: digest(rawPatch.diffSha256),
    localChecks: known(["PASSED"] as const, rawPatch.localChecks) };
  const packetSha256 = root.packetSha256 === undefined ? undefined : digest(root.packetSha256);
  const creditsConsumed = root.creditsConsumed === null ? null : number(root.creditsConsumed);
  const executions = [initial, postRepair, ...scenarios.map(({ result }) => result)].filter((entry) => entry !== undefined);
  if (new Set(executions.map(({ executionId }) => executionId)).size !== executions.length ||
      (executions.every((entry) => entry.creditsConsumed !== null) &&
        (creditsConsumed === null || Math.abs(creditsConsumed - executions.reduce((sum, entry) => sum + (entry.creditsConsumed ?? 0), 0)) > 1e-7))) return fail();
  if (finalStatus === "VERIFIED" && (initial?.verdict.status !== "VIOLATED" || postRepair?.verdict.status !== "SATISFIED" ||
      !repair?.completed || repair.timedOut || repair.exitCode !== 0 || !patch || !packetSha256 || creditsConsumed === null ||
      scenarios[0]?.amountCents !== 1000 || scenarios[1]?.amountCents !== 25000 ||
      scenarios.some(({ result }) => result.verdict.status !== "SATISFIED"))) return fail();

  return {
    schemaVersion: 1, runId, finalStatus, allowedPaths, contractId: "INV-001", defectOrigin: "SEEDED_BENCHMARK",
    objective: objectives.transfer.objective, contractSha256: expectedContractSha256, objectiveSha256: expectedObjectiveSha256,
    snapshotSha256: digest(root.snapshotSha256), protectedHashes: { "contracts/v1.json": expectedContractSha256 },
    initial, postRepair, scenarios, events, repair, patch, packetSha256, creditsConsumed, elapsedMs: number(root.elapsedMs, true),
  };
}

export type Receipt = ReturnType<typeof parseReceipt>;
export type BrowserResult = NonNullable<Receipt["initial"]>;

export const actorByState: Record<State, "Kane" | "Invariant" | "Codex"> = {
  READY: "Invariant", OBSERVING: "Kane", EVALUATING: "Invariant", VIOLATION_DETECTED: "Invariant",
  REPAIR_AUTHORIZED: "Invariant", REPAIRING: "Codex", VALIDATING_PATCH: "Invariant", REVERIFYING: "Kane",
  VERIFIED: "Invariant", REJECTED: "Invariant", INCONCLUSIVE: "Invariant", FAILED: "Invariant",
};

export function executionRows(receipt: Receipt) {
  return [
    ...(receipt.initial ? [{ label: "Seeded · $100", amountCents: 10000, result: receipt.initial }] : []),
    ...(receipt.postRepair ? [{ label: "Repaired · $100", amountCents: 10000, result: receipt.postRepair }] : []),
    ...receipt.scenarios.map(({ amountCents, result }) => ({ label: "Repaired · $" + amountCents / 100, amountCents, result })),
  ];
}
