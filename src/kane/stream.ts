import { isRecord } from "../invariants/evaluate";

type FinalEvent = {
  status: "passed" | "failed";
  ts: string;
  final_state?: Record<string, unknown>;
  context?: unknown;
  session_dir?: string;
  test_url?: string;
  credits_consumed?: number;
  duration?: number;
};

function hasDuplicateKeys(line: string): boolean {
  const stack: (Set<string> | null)[] = [];
  // Called after JSON.parse has established valid JSON. Strings are consumed
  // whole, so braces and colons inside text cannot change the nesting.
  for (const [token, key] of line.matchAll(/("(?:[^"\\]|\\.)*"(?=\s*:))|"(?:[^"\\]|\\.)*"|[{}\[\]]/g)) {
    if (token === "{") stack.push(new Set());
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else if (key) {
      const current = stack.at(-1);
      const decoded: string = JSON.parse(key);
      if (current?.has(decoded)) return true;
      current?.add(decoded);
    }
  }
  return false;
}

export function parseStream(stdout: string) {
  const events: Record<string, unknown>[] = [];
  let invalid = false;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event: unknown = JSON.parse(line);
      if (!isRecord(event) || event.v !== 1 || hasDuplicateKeys(line)) invalid = true;
      else events.push(event);
    } catch {
      invalid = true;
    }
  }
  const ends = events.filter((event) => event.type === "run_end");
  const end = ends[0];
  const finiteNonNegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  const validEnd = ends.length === 1 && (end.status === "passed" || end.status === "failed") &&
    typeof end.ts === "string" && Number.isFinite(Date.parse(end.ts)) &&
    (end.final_state === undefined || isRecord(end.final_state)) &&
    (end.session_dir === undefined || typeof end.session_dir === "string") &&
    (end.test_url === undefined || typeof end.test_url === "string") &&
    (end.credits_consumed === undefined || finiteNonNegative(end.credits_consumed)) &&
    (end.duration === undefined || finiteNonNegative(end.duration));
  const final = validEnd ? end as FinalEvent : null;
  const complete = !invalid && events[0]?.type === "stream_start" && events[0].surface === "run" &&
    events.filter((event) => event.type === "stream_start").length === 1 &&
    final !== null && events.at(-1) === end;
  return {
    final, complete,
    fatalEvent: events.some((event) => event.type === "error" || event.status === "failed"),
    completedSteps: events.filter((event) => typeof event.step === "number" && ["done", "failed"].includes(String(event.status))).length,
    cliVersion: typeof events[0]?.cli_version === "string" && /^\d+\.\d+\.\d+$/.test(events[0].cli_version) ? events[0].cli_version : null,
  };
}

export function workflowStatus(execution: {
  exitCode: number | null; timedOut: boolean; launchError: boolean; limitExceeded: boolean;
  stderr: string; stdout: string;
}, parsed: ReturnType<typeof parseStream>) {
  if (execution.timedOut || execution.exitCode === 3) return "TIMED_OUT";
  if (execution.launchError || execution.limitExceeded) return "INFRASTRUCTURE_ERROR";
  if (execution.exitCode === 2 && /not (logged|signed) in|authentication|unauthori[sz]ed/i.test(execution.stderr + execution.stdout)) return "AUTHENTICATION_ERROR";
  if (execution.exitCode === 2) return "INFRASTRUCTURE_ERROR";
  if (!parsed.complete) return "INCOMPLETE";
  if (execution.exitCode !== 0 || parsed.final?.status !== "passed" || parsed.fatalEvent) return "FAILED";
  return "PASSED";
}
