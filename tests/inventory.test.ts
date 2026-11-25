import assert from "node:assert/strict";
import { test } from "node:test";
import corrected from "../examples/inventory-transfer.project.json";
import seeded from "../examples/inventory-transfer-seeded.project.json";
import { initialStock, transferStock } from "../src/inventory/stock";
import { evaluateProject, parseProject } from "../src/projects/config";
import realSeeded from "../docs/evidence/inventory-seeded.json";
import realCorrected from "../docs/evidence/inventory-corrected.json";
import { inventoryArchive } from "../src/workspace/inventory-archive";

test("seeded and corrected inventory use identical project objectives and conservation contracts", () => {
  const { url: correctedUrl, ...correctedSpec } = parseProject(corrected);
  const { url: seededUrl, ...seededSpec } = parseProject(seeded);
  assert.deepEqual(correctedSpec, seededSpec);
  assert.equal(seededUrl, correctedUrl + "/seeded");
});

test("deterministic inventory logic and generic conservation distinguish seeded and corrected transfers", () => {
  const stock = initialStock();
  const evaluate = (seeded: boolean) => {
    const next = transferStock(stock, "40", seeded);
    return evaluateProject(parseProject(corrected), {
      before_north: String(stock.north), before_south: String(stock.south),
      after_north: String(next.north), after_south: String(next.south),
    });
  };
  assert.deepEqual([evaluate(false).status, evaluate(false).observed], ["SATISFIED", 350]);
  assert.deepEqual([evaluate(true).status, evaluate(true).observed], ["VIOLATED", 390]);
  assert.deepEqual(stock, initialStock());
  for (const invalid of ["0", "241", "1.2", " 4", "4\n", "9007199254740992"]) {
    assert.throws(() => transferStock(stock, invalid, false));
  }
});

test("inventory archive binds the genuine captures to the same contract and validates observations and provenance", () => {
  const runs = inventoryArchive([realSeeded, realCorrected]);
  assert.deepEqual(runs.map(({ workflow, verdict }) => [workflow, verdict.status, verdict.observed]), [
    ["PASSED", "VIOLATED", 390], ["PASSED", "SATISFIED", 350],
  ]);
  assert.equal(runs[0].contractSha256, runs[1].contractSha256);
  assert.equal(runs[0].objectiveSha256, runs[1].objectiveSha256);
  assert.throws(() => inventoryArchive([realSeeded, { ...realCorrected, observations: { ...realCorrected.observations, after_north: "201" } }]));
  assert.throws(() => inventoryArchive([realSeeded, { ...realCorrected, stdoutSha256: realSeeded.stdoutSha256 }]));
  assert.throws(() => inventoryArchive([realSeeded, { ...realCorrected, privateStream: "must never be exported" }]));
});
