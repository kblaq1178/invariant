import { isRecord } from "../invariants/evaluate";
import { parseDollars } from "../ledger/money";

export type Project = {
  schemaVersion: 1;
  name: string;
  description: string;
  url: string;
  objective: string;
  observations: string[];
  contract: { operator: "equality" | "conservation"; format: "integer" | "usd"; left: string[]; right: string[] };
};
const named = /^[a-z][a-z0-9_]{0,47}$/;
const owns = (input: object, key: string) => Object.hasOwn(input, key);
const exact = (input: unknown, keys: string[], context: string) => {
  if (!isRecord(input) || Object.keys(input).length !== keys.length || keys.some((key) => !owns(input, key))) {
    throw new Error("Invalid " + context + " fields.");
  }
  return input;
};
const message = (input: unknown, max: number, label: string) => {
  if (typeof input !== "string" || !input.trim() || input.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input)) {
    throw new Error(label + " is missing or invalid.");
  }
  return input.trim();
};

export function applicationUrl(input: unknown) {
  const raw = message(input, 350, "Application URL");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Application URL must be absolute."); }
  if (!["http:", "https:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username || url.password || /[\\?#]/.test(raw) || !/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?(?:\/|$)/i.test(raw)) {
    throw new Error("Use a loopback HTTP(S) URL without credentials, query, or fragment.");
  }
  return url.href;
}

export function parseProject(input: unknown): Project {
  const value = exact(input, ["schemaVersion", "name", "description", "url", "objective", "observations", "contract"], "project");
  if (value.schemaVersion !== 1) throw new Error("Only project schema version 1 is supported.");
  const { operator, format, left, right } = exact(value.contract, ["operator", "format", "left", "right"], "contract");
  if (operator !== "equality" && operator !== "conservation") throw new Error("Choose equality or conservation.");
  if (format !== "integer" && format !== "usd") throw new Error("Choose integer or usd observations.");
  const sideSize = operator === "equality" ? 1 : 2;
  const fields = (input: unknown, size: number): string[] => {
    if (!Array.isArray(input) || input.length !== size || input.some((key) =>
      typeof key !== "string" || !named.test(key) || key.trim() !== key || ["constructor", "prototype"].includes(key)) ||
      new Set(input).size !== size) throw new Error("Use distinct lower-case observation names and the required number of fields.");
    return [...input];
  };
  const observations = fields(value.observations, sideSize * 2);
  const contract: Project["contract"] = { operator, format, left: fields(left, sideSize), right: fields(right, sideSize) };
  const referenced = new Set([...contract.left, ...contract.right]);
  if (referenced.size !== observations.length || observations.some((key) => !referenced.has(key))) {
    throw new Error("Each required observation must be used exactly once across the two sides.");
  }
  const objective = message(value.objective, 2400, "Kane objective");
  if (observations.some((field) => !objective.includes("'" + field + "'") && !objective.includes('"' + field + '"'))) {
    throw new Error("Name each observation in quotes in the Kane objective.");
  }
  return {
    schemaVersion: 1, name: message(value.name, 80, "Project name"), description: message(value.description, 400, "Description"),
    url: applicationUrl(value.url), objective, observations, contract,
  };
}

export function readProjectJson(text: string): unknown {
  if (text.length > 65536) throw new Error("JSON exceeds the 64 KiB limit.");
  let data: unknown;
  text = text.replace(/^\uFEFF/, "");
  try { data = JSON.parse(text); } catch { throw new Error("Invalid JSON."); }
  const frames: (Set<string> | null)[] = [];
  for (const [token, key, numeric] of text.matchAll(/("(?:[^"\\]|\\.)*"(?=\s*:))|"(?:[^"\\]|\\.)*"|[{}\[\]]|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)) {
    if (numeric && (numeric.length > 17 || !/^-?\d+$/.test(numeric) || !Number.isSafeInteger(Number(numeric)))) {
      throw new Error("JSON numeric fields must be safe integers.");
    }
    if (token === "{") frames.push(new Set());
    else if (token === "[") frames.push(null);
    else if (token === "}" || token === "]") frames.pop();
    else if (key) {
      const frame = frames.at(-1);
      const decoded: string = JSON.parse(key);
      if (frame?.has(decoded)) throw new Error("Duplicate JSON field.");
      frame?.add(decoded);
    }
  }
  return data;
}
export const importProject = (text: string) => parseProject(readProjectJson(text));
export const exportProject = (project: Project) => JSON.stringify(parseProject(project), null, 2) + "\n";

function parseInteger(raw: unknown) {
  if (typeof raw === "string" && raw.length <= 17 && /^-?(0|[1-9]\d*)$/.test(raw) && raw.trim() === raw) raw = Number(raw);
  if (typeof raw !== "number" || !Number.isSafeInteger(raw)) throw new Error("Invalid or unsafe integer observation.");
  return raw;
}
export type ProjectVerdict = {
  status: "SATISFIED" | "VIOLATED" | "INCONCLUSIVE"; reason: string;
  expected: number | null; observed: number | null; difference: number | null; values?: Record<string, number>;
};

export function evaluateProject(input: Project, observations: unknown): ProjectVerdict {
  try {
    const project = parseProject(input);
    const supplied = exact(observations, project.observations, "observation");
    const values = Object.fromEntries(project.observations.map((key) => [key, project.contract.format === "usd" ?
      parseDollars(supplied[key], true) : parseInteger(supplied[key])]));
    const sum = (fields: string[]) => fields.reduce((total, key) => total + BigInt(values[key]), 0n);
    const left = sum(project.contract.left);
    const right = sum(project.contract.right);
    const [expected, observed, difference] = [left, right, right - left].map(Number);
    if (![expected, observed, difference].every(Number.isSafeInteger)) throw new Error("Invariant arithmetic exceeds safe integer bounds.");
    return { status: left === right ? "SATISFIED" : "VIOLATED", values, expected, observed, difference,
      reason: left === right ? "The two sides are equal." : "The observed side differs from the expected side." };
  } catch (error) {
    return { status: "INCONCLUSIVE", reason: error instanceof Error ? error.message : "Invalid evidence.",
      expected: null, observed: null, difference: null };
  }
}
