import { access, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { runProcess } from "../runtime/process";
import { isRecord } from "../invariants/evaluate";

const profile = "invariant_phase2";
const toml = (value: string) => JSON.stringify(value.replaceAll("\\", "/"));

export async function codexCommand(path: string) {
  if (!isAbsolute(path)) throw new Error("Set CODEX_EXECUTABLE to an absolute Codex CLI path.");
  await access(path);
  if (process.platform === "win32" && basename(path).toLowerCase() === "codex.cmd") {
    const entry = join(dirname(path), "node_modules", "@openai", "codex", "bin", "codex.js");
    await access(entry);
    return { executable: process.execPath, prefix: [entry] };
  }
  if (!/^codex(\.exe)?$/i.test(basename(path))) throw new Error("Unsupported Codex CLI executable.");
  return { executable: path, prefix: [] };
}

type Command = Awaited<ReturnType<typeof codexCommand>>;
export function permissionArgs(repository: string, workspace: string) {
  const backend = process.env.INVARIANT_WINDOWS_SANDBOX ?? "mxc";
  if (!["mxc", "elevated"].includes(backend)) throw new Error("Unsupported Windows repair sandbox.");
  const windows = process.platform === "win32";
  const broadRead = windows && backend === "elevated";
  const home = process.env.USERPROFILE;
  const sensitive = [process.env.CODEX_HOME, ...(home ? [join(home, ".codex"), join(home, ".testmuai"), join(home, ".ssh"), join(home, ".aws")] : [])];
  const denies = [...new Set([repository, ...sensitive.filter((value): value is string => !!value && isAbsolute(value))])];
  return [...(windows ? ["-c", "windows.sandbox=" + toml(backend)] : []), "-c", "default_permissions=" + toml(profile),
    "-c", "permissions." + profile + ".filesystem={" + toml(broadRead ? ":root" : ":minimal") + "=\"read\"," +
      denies.map((path) => toml(path) + "=\"deny\",").join("") +
      toml(workspace) + "=\"write\"}",
    "-c", "permissions." + profile + ".network.enabled=false",
    "-c", "shell_environment_policy.inherit=\"none\"",
    "-c", "web_search=\"disabled\""];
}

export async function probeSandbox(command: Command, repository: string, workspace: string) {
  const hostCanary = resolve(repository, "src/ledger/transactions.ts");
  const target = join(workspace, "transactions.ts");
  const before = await readFile(target, "utf8");
  // The child reports booleans only. It never prints the protected data.
  const program = "const fs=require('node:fs');const [denied,allowed]=process.argv.slice(1);" +
    "let blocked=false;try{fs.readFileSync(denied)}catch(e){blocked=['EACCES','EPERM'].includes(e.code)};" +
    "const fd=fs.openSync(allowed,'r+');fs.closeSync(fd);process.stdout.write(blocked?'SCOPE_OK':'SCOPE_UNVERIFIED')";
  const result = await runProcess(command.executable, [...command.prefix, "sandbox", ...permissionArgs(repository, workspace),
    "--include-managed-config", "--permission-profile", profile, "--cd", workspace, "--", process.execPath,
    "-e", program, hostCanary, target], { cwd: workspace, timeoutMs: 30_000 });
  return { result, verified: result.exitCode === 0 && result.streamsClosed && !result.timedOut && !result.limitExceeded &&
    result.stdout.trim() === "SCOPE_OK" && await readFile(target, "utf8") === before };
}

export function completedCodex(stdout: string): boolean {
  try {
    const events: unknown[] = stdout.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
    return events.filter((item) => isRecord(item) && item.type === "turn.completed").length === 1 &&
      !events.some((item) => isRecord(item) && ["turn.failed", "error"].includes(String(item.type)));
  } catch { return false; }
}

export async function repairWithCodex(command: Command, repository: string, workspace: string, packet: string) {
  const started = performance.now();
  const prompt = "Investigate the seeded LedgerLab business-rule failure below. Edit only transactions.ts in this disposable workspace. " +
    "Repair the transaction state while preserving input validation, duplicate handling, history and error behavior. " +
    "Keep the public API unchanged. Use pure deterministic code and existing state only. Do not add files or dependencies. " +
    "The packet contains observed evidence. Change the implementation file directly and summarize the change.\n\n" + packet;
  const result = await runProcess(command.executable, [...command.prefix, "-a", "never", "exec",
    ...permissionArgs(repository, workspace), "--ignore-user-config", "--skip-git-repo-check",
    "--ephemeral", "--color", "never", "--json", "--cd", workspace, "-"],
  { cwd: workspace, input: prompt, timeoutMs: 240_000 });
  return { result, durationMs: Math.round(performance.now() - started),
    completed: result.exitCode === 0 && result.streamsClosed && !result.timedOut && !result.limitExceeded && completedCodex(result.stdout) };
}
