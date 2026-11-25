# Phase 2 autonomous repair verification

The Phase 2 benchmark starts a dedicated LedgerLab instance at `http://127.0.0.1:3142/`. It uses the seeded conservation defect, the Phase 1B named observation objective, and the INV-001 contract. The primary objective is reused byte for byte. Additional $10 and $250 checks run only after the primary browser re-verification satisfies INV-001.

## Windows execution

Use the existing Codex CLI and Kane CLI sign-ins and the same Edge setup as Phase 1B. Complete the sandbox preflight before running the loop.

```powershell
codex.cmd --version
codex.cmd exec --help
codex.cmd login status
kane-cli.cmd whoami
kane-cli.cmd balance

$env:CODEX_EXECUTABLE = (Get-Command codex.cmd).Source
$env:KANE_CLI_EXECUTABLE = (Get-Command kane-cli.cmd).Source
if (-not $env:KANE_CLI_CHROME_PATH) {
  $env:KANE_CLI_CHROME_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
}
npm.cmd run repair -- --probe
```

The first probe selects MXC. This Windows executor reported that native MXC was unavailable. The elevated native backend requires an existing approved host setup. On this executor the explicit elevated probe passed.

```powershell
$env:INVARIANT_WINDOWS_SANDBOX = 'elevated'
npm.cmd run repair -- --probe
npm.cmd run repair
```

The host starts Codex CLI 0.167.0 using `-a never exec`, the named permissions profile, `--ignore-user-config --skip-git-repo-check --ephemeral --color never --json --cd <disposable-workspace> -`. The packet is passed on stdin. Kane receives the verified named-store objective with `--url http://127.0.0.1:3142/ --agent --headless --target desktop --max-steps 18 --timeout 240 --final-validation off`.

The budget and run lock are local to this checkout. A failed live pass latches the budget for review. Private records, source snapshots, packet, evidence streams and events live in `.invariant/phase-2-runs/`. Each lifecycle event is JSON on stdout and in `events.ndjson`. The repair target binds only to loopback. [Repair security model](REPAIR_SECURITY_MODEL.md)

## First live attempt and validator recovery

Run `c9ff516a-85a2-4dca-a83e-4f92e3ab67f3` captured Kane execution `a991d6eb-882e-4a65-a185-4c774839063f` in session `228a33fc-9edc-4db2-bade-743ca922c848`. Kane passed. Alice remained at 100,000 cents and Bob rose from 50,000 to 60,000 cents. INV-001 recorded `VIOLATED`, with expected 150,000 cents, observed 160,000 cents and a +10,000 cent difference. Kane reported 21.8415125 credits.

The orchestrator automatically invoked Codex. It exited 0 after 95,817 ms and edited the permitted transaction file. The original validator rejected the candidate because its JavaScript behavior checks redeclared a name in the same scope as the compiled module. A unit test independently reproduced that harness failure. The workspace was reset, the rejected run was preserved, and no post-patch Kane run was launched in that attempt. [First attempt receipt](evidence/phase-2-first-attempt.json) · [Actual Codex diff](evidence/phase-2-first-attempt.diff)

I fixed the validator's binding scope and added a positive regression check. The recovery command rechecked the retained baseline, candidate, Codex output hash and scope-gate artifacts before starting a fresh repair run. It carried forward the original Kane charge and the first Codex attempt.

```powershell
npm.cmd run repair -- --retry-validation c9ff516a-85a2-4dca-a83e-4f92e3ab67f3
```

## Engineering checks

| Command | Result |
| --- | --- |
| `npm.cmd test` | 25 passed, zero failed or skipped |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed |
| `npm.cmd run build` | Passed |

The tests use synthetic browser and agent records to exercise authorization, packet content, lifecycle and receipt generation, error handling, scope, protected-file drift, and re-verification gates. The live run evidence is stored separately.

## Primary closed loop

Run `3ac14b40-e704-4e99-9ce5-b059631c0c28` started from the same seeded transaction snapshot. Its initial Kane workflow passed and established an eligible INV-001 violation. The orchestrator sent the generated evidence packet to Codex CLI. Codex edited only the disposable `transactions.ts`. The diff adds the sender debit to the same balance update that credits the recipient. The inventory, protected hashes and local transaction behavior checks passed before the candidate was served.

| Stage | Execution ID | Kane session | Alice, before → after | Bob, before → after | Expected / observed total | INV-001 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Seeded $100 | `b8ceda9f-bd63-45c2-8938-8e0da89e4647` | `daadf386-db01-4a9b-9caf-aedb85c0c03e` | 100,000¢ → 100,000¢ | 50,000¢ → 60,000¢ | 150,000¢ / 160,000¢ | VIOLATED |
| Repaired $100 | `cf6aa289-1172-4684-b7ef-08054df38aa4` | `56a789c0-4323-4442-94f3-b3c912eac6c1` | 100,000¢ → 90,000¢ | 50,000¢ → 60,000¢ | 150,000¢ / 150,000¢ | SATISFIED |

Both workflows returned `PASSED` with all four named observations. The primary objective hash was `693753f35149bd7a50f80c3c3a2f2bdb5978d6fc24fc5ad812d1b2a2f6348552`. The contract hash was `393639a7598c4d24ad147dc5f8a1dfe1448355721527f125b649ba6e8ed674bb`. The actual source diff hash was `c99fbd03496cf821f42df58fc05a334fbb9c72d21f10de4079bb88cd6a7add95`.

Codex exited 0 after 89,915 ms. The repair packet SHA-256 was `2ca6c799a1a3547a16cbbfbf6793c88304bb598023d2e1952a94028d82fefcd3`. The final loop took 597,277 ms and ended `VERIFIED`. The original source and protected verification inputs remained unchanged. [Closed-loop receipt](evidence/phase-2-closed-loop.json) · [Actual accepted source diff](evidence/phase-2-closed-loop.diff)

## Additional repaired scenarios

| Amount | Execution ID | Kane session | Alice, before → after | Bob, before → after | Observed total | INV-001 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| $10 | `6eba7447-4ac1-4491-8539-18c9b2646b01` | `ef6a4c72-0c8c-44e0-9f03-a84b931f4e8b` | 100,000¢ → 99,000¢ | 50,000¢ → 51,000¢ | 150,000¢ | SATISFIED |
| $250 | `4e247d64-fc95-424b-9312-88caff413ef8` | `fab77814-ed65-4c4f-ba78-3927ea16cd2a` | 100,000¢ → 75,000¢ | 50,000¢ → 75,000¢ | 150,000¢ | SATISFIED |

Both Kane workflows passed and returned all four named observations. They establish the result for those amounts. The seeded benchmark remains available in the original application for repeatable observations.

## Evidence and credit ledger

| Execution | Reported credits | Kane evidence pack SHA-256 |
| --- | ---: | --- |
| First attempt, seeded $100 | 21.8415125 | `537f394fea98a6ddc6f45fd593bae63673f70d3b50553ea8029ba65c22e3b176` |
| Second attempt, seeded $100 | 23.8868375 | `23535c2aaf3c4f55d2c49134345eb3081eaa80c0ee9881df62d2b774620554b5` |
| Repaired $100 | 22.871355 | `a7211d39890602e34c7c8326b2321d4808d0c775fcd1b0df3a9e0c693e29e5b2` |
| Repaired $10 | 35.6292975 | `41742edae9de9ad8e25458182ec8389c8f5b32aecee8e40ccc41d6337b230fde` |
| Repaired $250 | 27.5425775 | `a6aba79e7fd792b331f35a930d0d4fc57e30c2a7d80a894b5d18f98ee1681b86` |
| **Phase 2 total** | **131.77158** | **5 Kane runs, 2 Codex repair attempts** |

The successful attempt used 109.9300675 credits. Raw Kane stream hashes, Codex stream hashes, packet and diff were checked against the completed receipt. The final run's Kane process IDs had exited by the time of the receipt audit. All receipts identify this as a seeded conservation benchmark.
