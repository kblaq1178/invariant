import catalog from "../../contracts/v1.json";
import { parseDollars } from "../ledger/money";

export type ContractId = "INV-001" | "INV-002" | "INV-003" | "INV-004" | "INV-005";
export type Provenance = { source: "kane"; executionId: string; field: string; stdoutSha256: string };
export type Observation = { value: string; provenance: Provenance };
export type Verdict = {
  contractId: ContractId;
  status: "SATISFIED" | "VIOLATED" | "INCONCLUSIVE";
  expected: unknown;
  observed: unknown;
  difference: number | (number | null)[] | null;
  explanation: string;
  provenance: Provenance[];
  timestamp: string;
  executionId?: string;
};
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cleanValue(key: string, raw: unknown): string | number {
  if (typeof raw !== "string") throw new Error("Missing or invalid observation " + key + ".");
  if (key.endsWith("_id")) {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(raw) || raw.length !== 36) throw new Error("Invalid transaction identifier.");
    return raw;
  }
  if (key.endsWith("_count")) {
    if (!/^(0|[1-9]\d*)$/.test(raw) || raw.trim() !== raw || !Number.isSafeInteger(Number(raw))) throw new Error("Invalid transaction count.");
    return Number(raw);
  }
  return parseDollars(raw, true);
}

function safe(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error("Invariant arithmetic exceeds the safe integer range.");
  return value;
}

export function evaluate(contractId: ContractId, observations: unknown, executionId?: string): Verdict {
  const contract = catalog.contracts.find(({ id }) => id === contractId);
  const result: Verdict = {
    contractId, status: "INCONCLUSIVE", expected: contract?.expectedRelationship ?? null, observed: null,
    difference: null, explanation: "", provenance: [], timestamp: new Date().toISOString(), executionId,
  };
  try {
    if (catalog.version !== 1 || !contract || contract.operator === "planned") throw new Error("Contract operator is unavailable.");
    if (!executionId || !isRecord(observations) ||
        Object.keys(observations).length !== contract.requiredObservations.length) throw new Error("Required observations are incomplete or unexpected.");
    const values = new Map<string, string | number>();
    for (const key of contract.requiredObservations) {
      const entry = observations[key];
      if (!isRecord(entry) || !isRecord(entry.provenance)) throw new Error("Missing observation " + key + ".");
      const provenance = entry.provenance;
      if (provenance.source !== "kane" || provenance.executionId !== executionId || provenance.field !== key ||
          typeof provenance.stdoutSha256 !== "string" || !/^[0-9a-f]{64}$/.test(provenance.stdoutSha256) ||
          provenance.stdoutSha256.length !== 64 ||
          (result.provenance.length && result.provenance[0].stdoutSha256 !== provenance.stdoutSha256)) {
        throw new Error("Observation provenance conflicts with the execution.");
      }
      values.set(key, cleanValue(key, entry.value));
      result.provenance.push({ source: "kane", executionId, field: key, stdoutSha256: provenance.stdoutSha256 });
    }
    const get = (key: string) => {
      const value = values.get(key);
      if (value === undefined) throw new Error("Contract references an unknown observation.");
      return value;
    };
    const numeric = (key: string) => {
      const value = get(key);
      if (typeof value !== "number") throw new Error("Expected a numeric observation.");
      return value;
    };
    if (contract.operator === "sum_equals" && contract.expectedRelationship.before && contract.expectedRelationship.after) {
      const sum = (keys: string[]) => keys.reduce((total, key) => safe(total + numeric(key)), 0);
      const expected = sum(contract.expectedRelationship.before);
      const observed = sum(contract.expectedRelationship.after);
      const difference = safe(observed - expected);
      return { ...result, expected, observed, difference, status: difference ? "VIOLATED" : "SATISFIED",
        explanation: difference ? "Combined balance changed after the transfer." : "Combined balance was preserved." };
    }
    if (contract.operator === "pairs_equal" && contract.expectedRelationship.pairs) {
      const pairs = contract.expectedRelationship.pairs;
      if (pairs.some((pair) => pair.length !== 2)) throw new Error("Invalid comparison pair.");
      const expected = pairs.map(([key]) => get(key));
      const observed = pairs.map(([, key]) => get(key));
      if (expected[3] !== observed[3]) throw new Error("The observed retry used a different transaction identifier.");
      if (typeof expected[2] !== "number" || expected[2] < 1) throw new Error("No successful transaction was established before retry.");
      const difference = observed.map((value, index) => {
        const baseline = expected[index];
        return typeof value === "number" && typeof baseline === "number" ? safe(value - baseline) : null;
      });
      const same = expected.every((value, index) => value === observed[index]);
      return { ...result, expected, observed, difference, status: same ? "SATISFIED" : "VIOLATED",
        explanation: same ? "The same transaction retry preserved balances and successful count." : "The retry changed a balance or successful count." };
    }
    throw new Error("Invalid contract operator or relationship.");
  } catch (error) {
    return { ...result, explanation: error instanceof Error ? error.message : "Invalid observation." };
  }
}
