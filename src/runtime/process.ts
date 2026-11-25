import { spawn } from "node:child_process";
import { join } from "node:path";

export function runProcess(executable: string, args: string[], options: {
  timeoutMs: number; cwd?: string; env?: NodeJS.ProcessEnv; input?: string;
  onChunk?: (channel: "stdout" | "stderr", chunk: Buffer) => void;
}) {
  return new Promise<{
    exitCode: number | null; stdout: string; stderr: string; stdoutBytes: Buffer; stderrBytes: Buffer;
    timedOut: boolean; launchError: boolean; limitExceeded: boolean; streamsClosed: boolean;
  }>((resolve) => {
    const child = spawn(executable, args, {
      shell: false, windowsHide: true, detached: process.platform !== "win32",
      cwd: options.cwd, env: options.env, stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin?.on("error", () => { /* Exit status captures early process refusal. */ });
    child.stdin?.end(options.input);
    const captures = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
    let bytes = 0;
    let timedOut = false;
    let limitExceeded = false;
    let launchError = false;
    let killing = false;
    let finished = false;
    let processExitCode: number | null = null;
    let grace: ReturnType<typeof setTimeout> | undefined;
    function killTree() {
      if (killing) return;
      killing = true;
      if (child.pid && process.platform === "win32") {
        const killer = spawn(join(process.env.SystemRoot ?? "C:/Windows", "System32", "taskkill.exe"),
          ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
        killer.on("error", () => child.kill());
        killer.once("exit", (code) => {
          if (code !== 0 && child.exitCode === null) child.kill();
        });
      } else if (child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill(); }
      }
      grace = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish(processExitCode, false);
      }, 10_000);
    }
    for (const channel of ["stdout", "stderr"] as const) {
      child[channel].on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024) {
          limitExceeded = true;
          killTree();
          return;
        }
        captures[channel].push(chunk);
        options.onChunk?.(channel, chunk);
      });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, options.timeoutMs);
    function finish(exitCode: number | null, streamsClosed: boolean) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(grace);
      const stdoutBytes = Buffer.concat(captures.stdout);
      const stderrBytes = Buffer.concat(captures.stderr);
      resolve({ exitCode, stdoutBytes, stderrBytes, stdout: stdoutBytes.toString("utf8"),
        stderr: stderrBytes.toString("utf8"), timedOut, launchError, limitExceeded, streamsClosed });
    }
    child.once("error", () => { launchError = true; });
    child.once("exit", (code) => { processExitCode = code; });
    child.once("close", (code) => finish(code, true));
  });
}
