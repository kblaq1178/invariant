import { kaneCommand, watchdogSeconds } from "../kane/execute";
import { parseStream, workflowStatus } from "../kane/stream";
import { runProcess } from "../runtime/process";
import { isRecord } from "../invariants/evaluate";
import { evaluateProject, parseProject, type Project } from "./config";

export const projectLimits = { maxSteps: 12, timeoutSeconds: 180 } as const;

// The benchmark adapter keeps its original route allowlist. The project
// entry point uses the same launcher, process bounds, and terminal parser.
export async function executeProject(command: Awaited<ReturnType<typeof kaneCommand>>, project: Project) {
  const valid = parseProject(project);
  return runProcess(command.executable, [...command.prefix, "run", valid.objective, "--url", valid.url, "--agent",
    "--headless", "--target", "desktop", "--max-steps", String(projectLimits.maxSteps), "--timeout",
    String(projectLimits.timeoutSeconds), "--final-validation", "off"], {
    timeoutMs: watchdogSeconds(projectLimits.timeoutSeconds) * 1000,
    env: { ...process.env, KANE_CLI_USER_AGENT: "codex" },
  });
}

export function readProjectExecution(project: Project, capture: Awaited<ReturnType<typeof executeProject>>) {
  const parsed = parseStream(capture.stdout);
  const workflow = workflowStatus(capture, parsed);
  const state = workflow === "PASSED" && capture.streamsClosed ? parsed.final?.final_state : undefined;
  // Kane agent mode includes unrelated fields next to named extractions.
  // Required values must be displayed text, so a JSON number cannot lose
  // precision during the protected terminal parser's initial JSON parse.
  const named = state && (!Object.hasOwn(state, "url") || state.url === project.url)
    ? Object.fromEntries(project.observations.filter((key) => Object.hasOwn(state, key) && typeof state[key] === "string")
      .map((key) => [key, state[key]]))
    : undefined;
  const verdict = evaluateProject(project, named);
  const terminal: unknown = parsed.final;
  const session = parsed.final?.session_dir?.split(/[\\/]/).at(-1);
  const run = isRecord(terminal) ? terminal.run_id : undefined;
  return { workflow, verdict, observations: verdict.values ? named : undefined,
    sessionId: session?.length === 36 && /^[a-f0-9-]{36}$/i.test(session) ? session : undefined,
    kaneRunId: typeof run === "string" && /^run-\d{1,8}$/.test(run) ? run : undefined,
    reportedCredits: parsed.final?.credits_consumed ?? null,
    durationSeconds: parsed.final?.duration ?? null, completedAt: parsed.final?.ts ?? null };
}
