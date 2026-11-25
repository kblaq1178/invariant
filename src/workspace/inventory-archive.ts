import { createHash } from "node:crypto";
import seeded from "../../examples/inventory-transfer-seeded.project.json";
import corrected from "../../examples/inventory-transfer.project.json";
import { isRecord } from "../invariants/evaluate";
import { evaluateProject, exportProject, parseProject } from "../projects/config";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = /^[a-f0-9]{64}$/;
const id = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const configs = [seeded, corrected].map(parseProject);
const invalid = (): never => { throw new Error("Inventory capture failed archive validation."); };
const exact = (value: Record<string, unknown>, fields: string[]) =>
  Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));

export function inventoryArchive(inputs: unknown[]) {
  if (inputs.length !== configs.length) return invalid();
  const results = configs.map((config, index) => {
    const raw = inputs[index];
    if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.source !== "KANE_CAPTURE" || raw.workflow !== "PASSED" ||
        !exact(raw, ["schemaVersion", "source", "executionId", "configurationSha256", "stdoutSha256", "objectiveSha256",
          "contractSha256", "stderrSha256", "limits", "exitCode", "workflow", "verdict", "observations", "sessionId", "kaneRunId",
          "reportedCredits", "durationSeconds", "completedAt", "provenance"]) ||
        raw.exitCode !== 0 || raw.configurationSha256 !== sha256(exportProject(config)) ||
        raw.contractSha256 !== sha256(JSON.stringify(config.contract)) || raw.objectiveSha256 !== sha256(config.objective) ||
        typeof raw.executionId !== "string" || !id.test(raw.executionId) || typeof raw.sessionId !== "string" || !id.test(raw.sessionId) ||
        typeof raw.kaneRunId !== "string" || !/^run-\d{1,8}$/.test(raw.kaneRunId) ||
        typeof raw.stdoutSha256 !== "string" || !digest.test(raw.stdoutSha256) ||
        typeof raw.stderrSha256 !== "string" || !digest.test(raw.stderrSha256) ||
        typeof raw.completedAt !== "string" || !Number.isFinite(Date.parse(raw.completedAt)) ||
        typeof raw.durationSeconds !== "number" || !Number.isFinite(raw.durationSeconds) || raw.durationSeconds < 0 ||
        typeof raw.reportedCredits !== "number" || !Number.isFinite(raw.reportedCredits) || raw.reportedCredits < 0 ||
        !isRecord(raw.limits) || !exact(raw.limits, ["maxSteps", "timeoutSeconds"]) ||
        raw.limits.maxSteps !== 12 || raw.limits.timeoutSeconds !== 180 ||
        !isRecord(raw.observations) || !isRecord(raw.provenance) || !exact(raw.provenance, config.observations) ||
        !isRecord(raw.verdict) || !exact(raw.verdict, ["status", "values", "expected", "observed", "difference", "reason"])) return invalid();
    const verdict = evaluateProject(config, raw.observations);
    if (!verdict.values || verdict.status === "INCONCLUSIVE" ||
        raw.verdict.status !== verdict.status || raw.verdict.expected !== verdict.expected ||
        raw.verdict.observed !== verdict.observed || raw.verdict.difference !== verdict.difference ||
        raw.verdict.reason !== verdict.reason || !isRecord(raw.verdict.values) || !exact(raw.verdict.values, config.observations)) return invalid();
    const fields = raw.observations;
    const provenance = raw.provenance;
    const reportedValues = raw.verdict.values;
    const observations = config.observations.map((key) => {
      const source = provenance[key];
      const value = fields[key];
      if (typeof value !== "string" || reportedValues[key] !== verdict.values?.[key] ||
          !isRecord(source) || !exact(source, ["executionId", "stdoutSha256", "field"]) || source.executionId !== raw.executionId ||
          source.field !== key || source.stdoutSha256 !== raw.stdoutSha256) return invalid();
      return { field: key, raw: value };
    });
    return { label: index === 0 ? "Seeded discrepancy" : "Corrected implementation",
      workflow: raw.workflow, verdict, observations, executionId: raw.executionId, sessionId: raw.sessionId, kaneRunId: raw.kaneRunId,
      stdoutSha256: raw.stdoutSha256, stderrSha256: raw.stderrSha256, contractSha256: raw.contractSha256,
      configurationSha256: raw.configurationSha256, objectiveSha256: raw.objectiveSha256,
      completedAt: raw.completedAt, durationSeconds: raw.durationSeconds, reportedCredits: raw.reportedCredits,
      download: JSON.stringify(raw, null, 2) };
  });
  if (results[0].executionId === results[1].executionId) return invalid();
  return results;
}
