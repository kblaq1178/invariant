# Phase 3 developer workspace

## Entry points

| Route | Purpose |
| --- | --- |
| /workspace | Local workspace with CLI instructions and browser-local receipt import |
| /demo | Read-only public evidence and historical replay |
| / | Original LedgerLab used by Phase 1B |
| /fixtures/conservation and /fixtures/idempotency | Original labeled defect fixtures |

The workspace provides Overview, Contracts, Executions, Repairs, Evidence, and an embedded LedgerLab sandbox. The overview separates Kane's workflow pass from the seeded INV-001 violation. Executions replays actual recorded lifecycle transitions. The Repairs inspector shows the hash-matched packet and diff for both Phase 2 attempts, including the rejected first attempt. The scenario matrix shows the $10, $100, and $250 runs against the repaired implementation.

## Evidence and trust

The bundled archive loads the two sanitized Phase 2 receipts and their source diffs, matches the contract and objective hashes, recomputes verdicts from named observations, and validates the event order. The archive recreates each packet from the retained receipt and accepts it only when its SHA-256 matches the original packet hash. The phase-2-browser-metadata file projects completion times and durations from the actual Kane terminal records and links them by execution ID and stdout hash. The explorer displays session IDs without exposing internal Test Manager URLs.

Local import runs in the browser and checks the receipt shape, known contract and objective hashes, event order, monetary values, observation provenance, and final verdict requirements. The import projects approved fields. It drops arbitrary diff text, paths, URLs, and raw stream fields. Imported artifacts remain in the current Evidence view and are labeled as unauthenticated. A self-consistent imported receipt can still have a false origin. Bundled JSON and diff exports use the sanitized Phase 2 artifacts.

## Local and public execution boundaries

The web application has no execution API, server action, agents, or process-spawn path. The local action opens a dialog with approved CLI commands and documented limits. The CLI retains authorization, sandbox preflight, persistent budget and locking. This avoids giving a public process access to a workstation's credentials or granting execution authority through a browser route. Public demo pages offer the bundled archive and replay. The embedded LedgerLab is a browser-local fictional sandbox.

Use PowerShell and the repository's installed dependencies.

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run start -- --port 3180
```

Open http://127.0.0.1:3180/workspace. Set the following during a public-only build to redirect the local workspace and its subpages to their demo counterparts.

```powershell
$env:INVARIANT_PUBLIC_ONLY = '1'
npm.cmd run build
npm.cmd run start -- --port 3180
```

The environment flag is evaluated during static generation. Clear it before rebuilding the local workspace.

## Checks executed

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
$env:INVARIANT_PUBLIC_ONLY = '1'
npm.cmd run build
node scripts/smoke-workspace.mjs public-only
$env:INVARIANT_PUBLIC_ONLY = ''
npm.cmd run build
node scripts/smoke-workspace.mjs local
```

The non-credit smoke script starts a loopback production server on port 3180 and launches Microsoft Edge headless. It exercises the outcome switch, keyboard activation, contract coverage labels, recorded replay, rejected attempt, scenario matrix, evidence selection, receipt and diff downloads, and embedded LedgerLab. It checks desktop and mobile layouts. Local mode also exercises the run dialog and validated, rejected, and duplicate receipts. Public-only mode checks workspace redirects, the absence of import and execution controls, and 404 responses from attempted execution endpoints.

The unit suite has 29 passing tests, including four archive and receipt integration tests. TypeScript checking, ESLint, and the production builds passed. Both Edge smoke modes exited 0 at desktop (1440 px) and mobile (390 px) widths. Public-only requests to the workspace redirected to the equivalent demo routes, and all five execution-endpoint probes returned HTTP 404.

The archived $100 seeded run shows Kane `PASSED` and INV-001 `VIOLATED` at 160,000 cents. The archived repaired $100, $10, and $250 runs show INV-001 `SATISFIED` at 150,000 cents each. The inspector reports INV-002 as unit-tested. All 19 protected file hashes from the Phase 2 verified receipt still match. Phase 2's persisted budget remained at five Kane executions, two repair attempts and 131.77158 reported credits. Phase 3 started no Kane runs or autonomous repair attempts.
