import { runProcess } from "../runtime/process";
import { access } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";

type Command = { executable: string; prefix: string[] };
export const watchdogSeconds = (kaneSeconds: number) => kaneSeconds + 60;
export async function kaneCommand(approvedPath: string): Promise<Command> {
  if (!isAbsolute(approvedPath)) throw new Error("Set KANE_CLI_EXECUTABLE to the absolute installed Kane CLI path.");
  const name = basename(approvedPath).toLowerCase();
  await access(approvedPath);
  if (process.platform === "win32" && name === "kane-cli.cmd") {
    // The installed npm shim forwards to this entry point. Start it with Node directly
    // so objective text never crosses cmd.exe's command parser.
    const entry = join(dirname(approvedPath), "node_modules", "@testmuai", "kane-cli", "bin", "kane-cli.cjs");
    await access(entry);
    return { executable: process.execPath, prefix: [entry] };
  }
  if (name !== "kane-cli" && name !== "kane-cli.exe") throw new Error("Unsupported Kane executable.");
  return { executable: approvedPath, prefix: [] };
}

export function execute(command: Command, request: {
  url: string; objective: string; maxSteps: number; timeoutSeconds: number;
}, onChunk?: (channel: "stdout" | "stderr", chunk: Buffer) => void) {
  const url = new URL(request.url);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash ||
      !["/", "/fixtures/conservation", "/fixtures/idempotency"].includes(url.pathname)) throw new Error("Expected a LedgerLab loopback URL.");
  const { objective, maxSteps, timeoutSeconds } = request;
  if (!objective.trim() || objective.length > 4000 || !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 25 ||
      !Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 240) throw new Error("Invalid execution bounds.");
  const args = [...command.prefix, "run", objective, "--url", url.href, "--agent", "--headless", "--target", "desktop",
    "--max-steps", String(maxSteps), "--timeout", String(timeoutSeconds), "--final-validation", "off"];

  return runProcess(command.executable, args, {
    timeoutMs: watchdogSeconds(timeoutSeconds) * 1000,
    env: { ...process.env, KANE_CLI_USER_AGENT: "codex" }, onChunk,
  });
}
