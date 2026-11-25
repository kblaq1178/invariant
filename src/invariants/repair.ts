import type { Verdict } from "./evaluate";

export interface RepairAuthorization {
  approvedFiles: readonly string[];
  maxAttempts: number;
  maxCredits: number;
  baselineRevision: string;
}
export interface RepairRequest {
  authorization: RepairAuthorization;
  violation: Verdict & { status: "VIOLATED" };
  contractSha256: string;
  objectiveSha256: string;
}
export interface RepairAttempt {
  revisionBefore: string;
  revisionAfter: string;
  diffSha256: string;
  verification: Verdict;
}
