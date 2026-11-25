import { evaluate, type Observation, type Verdict } from "../invariants/evaluate";
import { hash } from "./patch";

export const transitions = {
  READY: ["OBSERVING", "FAILED"], OBSERVING: ["EVALUATING", "INCONCLUSIVE", "FAILED"],
  EVALUATING: ["VIOLATION_DETECTED", "INCONCLUSIVE", "FAILED"], VIOLATION_DETECTED: ["REPAIR_AUTHORIZED", "REJECTED", "FAILED"],
  REPAIR_AUTHORIZED: ["REPAIRING", "FAILED"], REPAIRING: ["VALIDATING_PATCH", "FAILED", "REJECTED"],
  VALIDATING_PATCH: ["REVERIFYING", "REJECTED", "FAILED"], REVERIFYING: ["VERIFIED", "INCONCLUSIVE", "FAILED"],
  VERIFIED: [], INCONCLUSIVE: [], REJECTED: [], FAILED: [],
} as const;

export type State = keyof typeof transitions;
export type BrowserEvidence = {
  executionId: string; workflow: string; observations?: Record<string, Observation>;
  creditsConsumed: number | null; stdoutSha256: string; stderrSha256: string;
  contractSha256: string; objectiveSha256: string; sessionId?: string; kaneRunId?: string;
};
type CheckedBrowser = BrowserEvidence & { verdict: Verdict };
export type RepairPacket = ReturnType<typeof makePacket>;
export type AgentRecord = {
  completed: boolean; exitCode: number | null; timedOut: boolean; durationMs: number; stdoutSha256: string; stderrSha256: string;
};
export type Patch = { changedFiles: string[]; diff: string; diffSha256: string; localChecks: "PASSED" };

export function checkBrowser(result: BrowserEvidence): CheckedBrowser {
  const candidate = result.observations;
  const complete = result.workflow === "PASSED" && candidate && Object.values(candidate).every(({ provenance }) =>
    provenance.stdoutSha256 === result.stdoutSha256 && provenance.executionId === result.executionId);
  return { ...result, verdict: evaluate("INV-001", complete ? candidate : undefined, result.executionId) };
}

export function makePacket(browser: CheckedBrowser, objective: string, contractSha256: string, allowedPaths: readonly string[]) {
  if (browser.workflow !== "PASSED" || browser.verdict.status !== "VIOLATED" || !browser.observations ||
      browser.contractSha256 !== contractSha256 || browser.objectiveSha256 !== hash(objective) ||
      checkBrowser(browser).verdict.status !== "VIOLATED") throw new Error("Evidence is ineligible for repair.");
  return {
    contractId: "INV-001", contractSha256, objectiveSha256: hash(objective),
    businessRule: "A completed transfer preserves the sum of the sender and recipient balances.",
    objective, executionId: browser.executionId, observations: browser.observations,
    expected: { relationship: "sum(after balances) = sum(before balances)", totalCents: browser.verdict.expected },
    actual: { beforeTotalCents: browser.verdict.expected, afterTotalCents: browser.verdict.observed,
      relationship: browser.verdict.explanation, differenceCents: browser.verdict.difference },
    browserEvidence: { stdoutSha256: browser.stdoutSha256, stderrSha256: browser.stderrSha256,
      sessionId: browser.sessionId, kaneRunId: browser.kaneRunId },
    allowedPaths,
  };
}

type Context = { runId: string; objective: string; contractSha256: string; allowedPaths: readonly string[];
  snapshotSha256: string; protectedHashes: Record<string, string>; objectiveSha256: string };
type Event = { runId: string; state: State; at: string };
export interface Dependencies {
  integrity: () => Promise<boolean>;
  observe: (amount: number, objective: string) => Promise<BrowserEvidence>;
  repair: (packet: string) => Promise<AgentRecord>;
  validate: () => Promise<Patch>;
  event?: (event: Event) => void;
  scenarioObjective: (amount: number) => string;
}
export async function runRepair(context: Context, deps: Dependencies) {
  const started = Date.now();
  const events: Event[] = [{ runId: context.runId, state: "READY", at: new Date().toISOString() }];
  deps.event?.(events[0]);
  let state: State = "READY";
  const transition = (next: State) => {
    if (!(transitions[state] as readonly State[]).includes(next)) throw new Error("Invalid repair lifecycle transition.");
    state = next;
    const event = { runId: context.runId, state, at: new Date().toISOString() };
    events.push(event);
    deps.event?.(event);
  };
  let initial: CheckedBrowser | undefined;
  let postRepair: CheckedBrowser | undefined;
  let repair: AgentRecord | undefined;
  let packetSha256: string | undefined;
  let patch: Patch | undefined;
  let reason: string | undefined;
  const scenarios: { amountCents: number; result: CheckedBrowser }[] = [];
  const stop = (next: State, explanation: string) => { transition(next); reason = explanation; };
  const observe = async (amount: number, objective: string) => {
    const result = await deps.observe(amount, objective);
    if (result.contractSha256 !== context.contractSha256 || result.objectiveSha256 !== hash(objective)) {
      throw new Error("Verification configuration drifted.");
    }
    return checkBrowser(result);
  };

  try {
    if (!await deps.integrity()) throw new Error("Protected inputs changed.");
    transition("OBSERVING");
    initial = await observe(10_000, context.objective);
    transition("EVALUATING");
    if (initial.verdict.status !== "VIOLATED" || initial.creditsConsumed === null) {
      stop("INCONCLUSIVE", "Initial browser evidence did not establish an eligible seeded violation.");
    } else {
      transition("VIOLATION_DETECTED");
      if (!await deps.integrity()) {
        stop("REJECTED", "Protected inputs changed before authorization.");
      } else {
        const packet = JSON.stringify(makePacket(initial, context.objective, context.contractSha256, context.allowedPaths), null, 2);
        packetSha256 = hash(packet);
        transition("REPAIR_AUTHORIZED");
        transition("REPAIRING");
        repair = await deps.repair(packet);
        if (!repair.completed) {
          stop("FAILED", "The Codex execution did not complete successfully.");
        } else {
          transition("VALIDATING_PATCH");
          try {
            if (!await deps.integrity()) throw new Error("Protected inputs changed.");
            patch = await deps.validate();
          } catch {
            stop("REJECTED", "Patch scope, protected inputs, or local checks failed.");
          }
          if (patch) {
            transition("REVERIFYING");
            postRepair = await observe(10_000, context.objective);
            if (!await deps.integrity()) {
              stop("FAILED", "Protected inputs changed after the patch.");
            } else if (postRepair.verdict.status !== "SATISFIED" || postRepair.creditsConsumed === null) {
              stop(postRepair.verdict.status === "VIOLATED" ? "FAILED" : "INCONCLUSIVE", "Primary re-verification did not satisfy INV-001.");
            } else {
              for (const amountCents of [1_000, 25_000]) {
                const result = await observe(amountCents, deps.scenarioObjective(amountCents));
                scenarios.push({ amountCents, result });
                if (result.verdict.status !== "SATISFIED" || result.creditsConsumed === null || !await deps.integrity()) break;
              }
              if (scenarios.length === 2 && scenarios.every(({ result }) =>
                result.verdict.status === "SATISFIED" && result.creditsConsumed !== null) && await deps.integrity()) transition("VERIFIED");
              else stop("INCONCLUSIVE", "Additional scenario verification did not complete successfully.");
            }
          }
        }
      }
    }
  } catch {
    stop("FAILED", "A protected input, infrastructure, or execution budget check blocked the loop.");
  }
  const executions = [initial, postRepair, ...scenarios.map(({ result }) => result)].filter((item) => item !== undefined);
  const creditsConsumed = executions.some((item) => item.creditsConsumed === null) ? null :
    executions.reduce((total, item) => total + (item.creditsConsumed ?? 0), 0);
  return { schemaVersion: 1, ...context, contractId: "INV-001", defectOrigin: "SEEDED_BENCHMARK",
    initial, repair, packetSha256, patch, postRepair, scenarios, events, creditsConsumed,
    elapsedMs: Date.now() - started, finalStatus: state as State, reason };
}
