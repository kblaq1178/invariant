# Phase 5 verification

## Independent inventory benchmark

Warehouse inventory is an independent browser-local stock transfer application. Its two routes expose the same North and South quantities, reset action, transfer form, and successful confirmation. The visibly labeled seeded fixture credits South while leaving North stock unchanged. The corrected route updates both quantities.

The two project files share one integer conservation contract and the same objective. They differ only in the start URL. Both checks use the generic project CLI and the existing Kane terminal parser. They compare the sum of North and South before and after moving 40 units. The earlier warehouse equality example remains an imported deterministic fixture.

```powershell
npm.cmd run build
npm.cmd run start -- --port 3182
```

In a second PowerShell session with the existing Kane sign-in and Edge override:

```powershell
$env:KANE_CLI_EXECUTABLE = (Get-Command kane-cli.cmd).Source
npm.cmd run project -- run examples/inventory-transfer-seeded.project.json --authorize-kane
npm.cmd run project -- run examples/inventory-transfer.project.json --authorize-kane
```

Kane CLI 0.10.9 was authenticated. Each run was bounded to 12 steps and 180 seconds, with a 240-second process watchdog and the shared verification lock. The commands ran sequentially. A conclusive seeded violation permitted the corrected check. Inventory is a controlled comparison of existing implementations. The autonomous repair evidence remains the LedgerLab benchmark.

| Case | Invariant execution ID | Kane session | North before → after | South before → after | Expected / observed | Kane | Conservation |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| Seeded | `15b65173-d48f-497a-a74e-7d74f6153bf8` | `49e4ebcd-ae09-4faf-a00a-844336ee0edc` | 240 → 240 | 110 → 150 | 350 / 390 units | PASSED | VIOLATED (+40) |
| Corrected | `740095f9-a74f-4bea-8c0b-63f353578d0e` | `6ba539e5-b5b9-4733-87e2-cc70d7fd74a7` | 240 → 200 | 110 → 150 | 350 / 350 units | PASSED | SATISFIED (0) |

The seeded terminal event reported 70.7 seconds and 25.6596625 credits. Named extractions were text strings. The local CLI emitted a conclusive violation and exit code 1 while Kane itself exited 0.

The corrected terminal event reported 76.1 seconds and 23.2372175 credits. The CLI and Kane both exited 0. Phase 5 used exactly two Kane runs and **48.89688 reported credits**. The Phase 2 budget remained intact. The two receipts share contract SHA-256 `1a08e849c7301570d0b65a356b67ac198ae0ad718f75f1eb714a83a31a4d6d8a` and objective SHA-256 `aa35379009ea66fd3564cb43dbad6292e378f8ea3b9ab13aa363b0bff08d9be9`. [Seeded receipt](evidence/inventory-seeded.json) · [Corrected receipt](evidence/inventory-corrected.json)

| Case | Raw stdout SHA-256 | Kane evidence pack SHA-256 |
| --- | --- | --- |
| Seeded | `521b186b2079dac02c5ff9c5f0688a5b7d9b8009cdf04cbfa5493b40e3da0571` | `41f1e8cf6fe44b5265c3e25a16c54cb616e3340f829d51ee35e898eb1d8d68b1` |
| Corrected | `baa8558e5cd0922c7c23910122bdf1affb07e99008113313fe853bbc6fee1e98` | `2dd9876f35a42d1ca8877ef28edb49e38ca359cde63209ae8d9f64d8b9add3f7` |

The two sanitized captures are available in the Evidence explorer under **Warehouse inventory** with their raw named values, durations, credit charges, and hash-linked provenance. The archive recomputes each verdict using the generic evaluator and checks both project configurations against recorded hashes. LedgerLab remains the separate autonomous repair benchmark.

## Release security audit

The publication candidate was built from paths selected by `git ls-files --cached --others --exclude-standard`. The audit checked common credential signatures, quoted secret assignments, and user-home paths without printing matched values. No environment files, raw agent streams, user-specific paths, credentials, or generated dependencies belonged to the candidate. Package and browser artifacts remained local.

The Git index was empty. `git rev-list --all --count` found zero reachable commits, the reflog was empty, and `git fsck --full --no-reflogs --unreachable` reported no history or unreachable objects. There was therefore no committed content to publish or scrub. This repository's first commit still requires approval.

The ignore rules cover local project exports and configuration directories, raw agent and execution records, environment files, private keys, npm overrides, Vercel local state, installed dependencies, and build output. The examples directory contains only checked-in-friendly project templates. Original private evidence was retained.

The final candidate contained 80 files. All three pattern groups returned zero matches, and no candidate path matched a private runtime or generated build pattern. The lockfile's package URLs used the public npm registry. Git had zero refs, index entries, and remotes. The source tree contained zero Next.js route handlers. The secret scan covers the listed patterns.

## Clean installation and final checks

A separate ignored snapshot was populated from the Git publication candidate. It started without installed packages, builds, or private records. `npm.cmd ci --offline --cache <existing-npm-cache> --no-fund --no-audit` installed 360 packages from the lockfile and cached tarballs. Node.js 26.13.0 and npm 11.20.0 were used on Windows. The pinned ESLint 9 installation emitted a deprecation warning. Lint still passed.

| Check | Result |
| --- | --- |
| Clean `npm.cmd test` | 38 passed, zero failed or skipped |
| Clean `npm.cmd run typecheck` | Passed |
| Clean `npm.cmd run lint` | Passed |
| Clean project validation and inventory equality fixture | Configuration validated. Imported fixture returned the expected `VIOLATED` and exit 1 |
| Local production build | Passed |
| Clean public-only production build with `INVARIANT_PUBLIC_ONLY=1` | Passed |
| Local and public-only Edge smoke | Passed at desktop 1440 px and mobile 390 px |
| Public-only privacy checks | Workspace redirects passed. Both Projects routes and all five execution-endpoint probes returned 404 |
| Archived evidence integrity | All 19 Phase 2 protected hashes matched. Both Phase 2 receipts and diffs matched the retained files, and all three Phase 1B stdout and stderr pairs matched their receipts |

The Edge checks exercised the guided demo, outcome switch and keyboard control, historical replay, repair diff, receipt and diff exports, local project validation and persistence, invalid receipt handling, embedded LedgerLab, inventory transfer and reset, and both inventory evidence records. Browser smoke checks consumed zero Kane credits.

```powershell
# Local production build and smoke
$env:INVARIANT_PUBLIC_ONLY = ''
npm.cmd run build
$env:INVARIANT_SMOKE_PORT = '3184'
node scripts/smoke-workspace.mjs local

# In the clean publication snapshot
$env:INVARIANT_PUBLIC_ONLY = '1'
npm.cmd run build
$env:INVARIANT_SMOKE_PORT = '3183'
node scripts/smoke-workspace.mjs public-only
```

## Release recommendation

**GO for an approved first publication and public-only deployment.** The retained evidence, cross-application verification, clean installation, and public boundary checks passed. No new autonomous repair was run. The actual GitHub repository, hosting configuration, public URL, deployed smoke check, and submission still require approval or confirmation. See the [release checklist](RELEASE_CHECKLIST.md).
