# Phase 4 developer integration

## Product experience

The overview keeps the approved graphite, dark olive, acid-lime and monospace design. It leads with the genuine passing Kane workflow and the violated conservation rule, then shows the expected and observed totals. The recorded comparison switches between the seeded and repaired $100 transfers. The pipeline shows the complete observe, evaluate, repair, and re-verify loop.

Historical replay highlights the selected stage and derives its inputs, outputs, timestamps, execution identifiers, and credits from the bundled receipts. The repair inspector shows the hash-matched packet, authorized scope, local validation result, and actual multiline diff. Copy and export use the original diff bytes. The first rejected attempt remains in the archive.

The guided public demo includes the recorded state comparison, repair diff, and all three re-verified scenarios. Local Projects supports creating, editing, validating, importing, and exporting versioned JSON configurations. Saved configurations live only in browser storage for that origin. Export is the handoff to the local CLI.

## Configuration and CLI

Version 1 project files use exact fields for the name, description, application URL, Kane objective, required observations, and contract. Each required name appears in quotes in the objective. The two declarative operators are:

| Operator | Required observations | Relationship |
| --- | --- | --- |
| equality | Two named values | One expected value equals one observed value |
| conservation | Four named values | The sum of two values on the left equals the sum of two on the right |

Set format to integer for safe integers or usd for canonical displayed currency such as $1,000.00. USD is normalized to integer cents. Sums and differences are calculated exactly and checked for safe integer bounds. Kane must return required values as displayed text. JSON fixture numbers must use safe integer syntax. Missing fields, extra fixture fields, conflicting contract references, and invalid values cannot produce a conclusive verdict. Duplicate JSON keys and unknown configuration fields are rejected.

```powershell
npm.cmd run project -- validate examples/ledgerlab.project.json
npm.cmd run project -- validate examples/inventory.project.json
npm.cmd run project -- fixture examples/inventory.project.json examples/inventory.deterministic-fixture.json
```

The warehouse example is a deterministic fixture. Its imported counts are 240 and 238, yielding VIOLATED and a difference of -2. The fixture receipt is labeled IMPORTED_DETERMINISTIC_FIXTURE and carries no Kane provenance. The example URL is a placeholder for an actual inventory application running locally.

For a separately authorized browser verification, configure the existing Kane executable, keep the existing Edge override, and supply an exported configuration for a running loopback application.

```powershell
$env:KANE_CLI_EXECUTABLE = (Get-Command kane-cli.cmd).Source
if (-not $env:KANE_CLI_CHROME_PATH) {
  $env:KANE_CLI_CHROME_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
}
npm.cmd run project -- run my-project.json --authorize-kane
```

The command uses the approved Kane launcher, explicit arguments, terminal parser, and process handling. It takes the shared workspace verification lock and permits one run with 12 steps, a 120-second Kane timeout, and a 180-second watchdog. Raw streams stay under the ignored .invariant/project-runs directory. The receipt links normalized values to the captured stdout hash. A failed, incomplete, or conflicting terminal result yields INCONCLUSIVE. Exit codes are 0 for SATISFIED, 1 for VIOLATED, and 2 for INCONCLUSIVE or input/setup errors.

The initial URL must be loopback HTTP(S) without credentials, query, or fragment. The CLI validates a reported terminal URL when present. The browser can follow additional navigation in the objective, so review the application content and objective before authorizing a run. The generic path reuses the protected parsing and process helpers. Its arithmetic dispatcher implements these two fixed operators. Autonomous repair remains scoped to the existing LedgerLab benchmark.

## Local review and public deployment

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run start -- --port 3181
```

Open http://127.0.0.1:3181/workspace or http://127.0.0.1:3181/demo. For a public deployment, build Next.js with INVARIANT_PUBLIC_ONLY=1 and serve the resulting production application. This flag is evaluated at build time. Public-only builds redirect supported workspace views to the demo and return 404 for Projects. The application exposes no agent execution endpoints. Public browser data consists of the bundled sanitized archive. Exclude private runtime records and credentials from deployment inputs.

```powershell
$env:INVARIANT_PUBLIC_ONLY = '1'
npm.cmd run build
npm.cmd run start -- --port 3181
```

## Submission status

The custom project path has deterministic and synthetic terminal-capture coverage. A first real Kane run against a non-LedgerLab application requires separate authorization and a running application. Public hosting, pushing, and submission remain approval-gated.

## Verification

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
$env:INVARIANT_SMOKE_PORT = '3181'
$env:INVARIANT_PUBLIC_ONLY = '1'
npm.cmd run build
node scripts/smoke-workspace.mjs public-only
$env:INVARIANT_PUBLIC_ONLY = ''
npm.cmd run build
node scripts/smoke-workspace.mjs local
```

All 35 automated tests passed, including configuration round trips, URL boundaries, malformed observations, synthetic terminal parsing, and diff line numbering. TypeScript checking, ESLint, and both production builds passed. Both example configurations passed CLI validation. The imported inventory fixture returned VIOLATED with exit code 1 as expected.

The headless Edge smoke suites exited 0 in local and public-only modes, with 1440 px desktop and 390 px mobile viewports. They covered the genuine comparison, keyboard outcome selection, recorded stage inputs and outputs, multiline source diff, receipt and diff export, and LedgerLab. Local mode also validated, saved, reloaded, imported, and exported a project configuration. Public-only mode verified workspace redirects, 404 responses for both Projects routes, and HTTP 404 for all five execution endpoint probes.

All 19 recorded Phase 2 protected hashes matched. Both Phase 2 receipts and both diffs also matched their original private archival copies byte for byte. The archive verified its packet, contract, and objective hashes. The Phase 2 budget stayed at five Kane runs, 131.77158 credits, and two repairs. No Phase 4 Kane runs or autonomous repairs were started.
