import { cleanValue, isRecord, type Observation } from "../invariants/evaluate";

export function normalize(keys: readonly string[], state: unknown, executionId: string, stdoutSha256: string, expectedUrl?: string) {
  if (!isRecord(state)) {
    throw new Error("Kane returned incomplete or unexpected named observations.");
  }
  if (expectedUrl && Object.hasOwn(state, "url") && state.url !== expectedUrl) {
    throw new Error("Kane reported a different final page.");
  }
  // Kane includes incidental state alongside explicitly requested variables.
  // Project the configured fields so unrelated values stay in private evidence.
  const observations: Record<string, Observation> = {};
  for (const field of keys) {
    const value = state[field];
    if (!Object.hasOwn(state, field) || typeof value !== "string") throw new Error("Missing or invalid observation " + field + ".");
    cleanValue(field, value);
    observations[field] = { value, provenance: { source: "kane", executionId, field, stdoutSha256 } };
  }
  return observations;
}
