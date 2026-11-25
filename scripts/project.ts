import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { kaneCommand } from "../src/kane/execute";
import { evaluateProject, exportProject, importProject, readProjectJson } from "../src/projects/config";
import { executeProject, projectLimits, readProjectExecution } from "../src/projects/kane";

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
async function readBounded(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > 65536) throw new Error("Choose a regular JSON file of at most 64 KiB.");
  const data = await readFile(path, "utf8");
  if (Buffer.byteLength(data) > 65536) throw new Error("JSON exceeds the 64 KiB limit.");
  return data;
}
async function main() {
  const [, , mode, path, argument, ...extra] = process.argv;
  if (!path || extra.length || !(mode === "validate" && !argument || mode === "fixture" && argument ||
      mode === "run" && argument === "--authorize-kane")) {
    console.error("Usage: npm.cmd run project -- validate <project.json> | fixture <project.json> <observations.json> | run <project.json> --authorize-kane");
    return 2;
  }
  const project = importProject(await readBounded(path));
  const configurationSha256 = hash(exportProject(project));
  if (mode === "validate") {
    console.log(JSON.stringify({ valid: true, configurationSha256, project }, null, 2));
    return 0;
  }
  if (mode === "fixture") {
    const fixture = await readBounded(argument);
    let verdict;
    try { verdict = evaluateProject(project, readProjectJson(fixture)); }
    catch { verdict = { ...evaluateProject(project, undefined), reason: "Fixture JSON is malformed or contains duplicate fields." }; }
    console.log(JSON.stringify({ source: "IMPORTED_DETERMINISTIC_FIXTURE", configurationSha256,
      inputSha256: hash(fixture), verdict }, null, 2));
    return verdict.status === "SATISFIED" ? 0 : verdict.status === "VIOLATED" ? 1 : 2;
  }

  const command = await kaneCommand(process.env.KANE_CLI_EXECUTABLE ?? "");
  const lock = ".invariant/verification-lock";
  await mkdir(".invariant/project-runs", { recursive: true });
  await mkdir(lock);
  try {
    const executionId = randomUUID();
    const directory = join(".invariant/project-runs", executionId);
    await mkdir(directory);
    const save = (file: string, bytes: Buffer | string) => writeFile(join(directory, file), bytes, { mode: 0o600, flag: "wx" });
    await save("attempt.json", JSON.stringify({ executionId, configurationSha256, limits: projectLimits }, null, 2));
    const capture = await executeProject(command, project);
    await save("stdout.ndjson", capture.stdoutBytes);
    await save("stderr.txt", capture.stderrBytes);
    const stdoutSha256 = hash(capture.stdoutBytes);
    const result = readProjectExecution(project, capture);
    const receipt = {
      schemaVersion: 1, source: "KANE_CAPTURE", executionId, configurationSha256, stdoutSha256,
      objectiveSha256: hash(project.objective), contractSha256: hash(JSON.stringify(project.contract)),
      stderrSha256: hash(capture.stderrBytes), limits: projectLimits, exitCode: capture.exitCode, ...result,
      provenance: result.verdict.values && Object.fromEntries(Object.keys(result.verdict.values).map((field) =>
        [field, { executionId, stdoutSha256, field }])),
    };
    await save("receipt.json", JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt, null, 2));
    return result.verdict.status === "SATISFIED" ? 0 : result.verdict.status === "VIOLATED" ? 1 : 2;
  } finally { await rmdir(lock); }
}
main().then((code) => { process.exitCode = code; }, (error: unknown) => {
  // Avoid printing host paths, raw browser streams, or CLI environment details.
  console.error(error instanceof Error && !("code" in error) ? error.message : "Project configuration or execution could not be opened.");
  process.exitCode = 2;
});
