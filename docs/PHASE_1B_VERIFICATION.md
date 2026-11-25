# Phase 1B Kane verification

## Previous execution

Execution `118984c4-e2a7-44a5-a1c8-a9c30434b1da` emitted nine stdout events. Its three completed steps were navigation to LedgerLab, a textual/visual analysis framed around whether Bob's balance was stored, and a wait framed around completion of the requested extractions. These remarks show what Kane attempted. The stream contains no named extraction data. The last event was step 4 with status `done` at 15:44:13.667Z on November 25, 2026. Stderr contained only the desktop browser banner.

Kane reported successful navigation. The app returned HTTP 200 when checked near the end of the attempt and again before Phase 1B. The earlier attempt did not continuously probe availability, so uninterrupted reachability cannot be established. Progress arrived about seven seconds before the watchdog fired, and no terminal event arrived. The watchdog terminated a session that had been emitting progress. The trace does not establish what Kane was doing between its last progress event and termination.

The old watchdog allowed 110 seconds for Kane's configured 100-second timeout. Roughly 61 seconds passed from the stream header to the first workflow plan event. Kane's private session log shows its internal browser runner exiting with code 0 and upload starting at 15:44:17. Finalization reported success at 15:44:18, and evidence sharing finished at 15:44:20, the same second as the watchdog recorded termination. The watchdog cut across the end of post-step processing. The logs do not establish whether Kane had prepared the terminal record or how soon it would have emitted it. Captured progress shows stdout was being drained. A final checkpoint or buffered terminal result remains unproven. The prior Kane PID was absent at the Phase 1B readiness check. A process inventory found no Kane run or Kane-profile browser process, although Kane had left a stale session pointer.

## Changes and readiness

Phase 1B uses a separate three-attempt budget with the existing workspace-wide lock. The read-only objective uses direct named stores and a 10-step limit. The seeded and corrected workflows reset the ledger and use identical instructions and the same INV-001 contract. Each run uses a 240-second Kane timeout and a 300-second watchdog. The adapter waits for child closure and drains the pipes, then bounds post-kill drain time to ten seconds. An explicit `--final-validation off` removes the optional generated checkpoint from this diagnostic. The installed CLI did not advertise a per-run credit cap, so the runner checks reported spending between launches. [Kane CLI command reference](https://www.testmuai.com/docs/kane-cli-cli-reference) · [Agent mode and terminal result format](https://www.testmuai.com/docs/kane-cli-agent-mode)

LedgerLab returned HTTP 200 and rendered the Alice and Bob labels with $1,000.00 and $500.00 in its initial HTML. This was a readiness check. Browser observations come from Kane's terminal result. Edge was present, the launch shell checked its executable path, and the adapter passes the browser override through the child environment. The configured Kane sign-in verified successfully and the starting balance was 10,161.5057 credits.

## Commands

```powershell
$env:KANE_CLI_USER_AGENT = 'codex'
kane-cli.cmd whoami
kane-cli.cmd balance
$env:KANE_CLI_EXECUTABLE = (Get-Command kane-cli.cmd).Source
if (-not $env:KANE_CLI_CHROME_PATH) {
  $env:KANE_CLI_CHROME_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
}
npm.cmd run verify -- observe
npm.cmd run verify -- revalidate-observe b304f85f-04e2-47f1-ac24-8b0208563a38
npm.cmd run verify -- seeded-conservation
npm.cmd run verify -- transfer
```

The runner passes the objective as one argument, followed by `--url http://127.0.0.1:3000/ --agent --headless --target desktop --max-steps 10 --timeout 240 --final-validation off`.
The transfer commands use the same flags with `--max-steps 18` and their respective start URLs, `http://127.0.0.1:3000/fixtures/conservation` and `http://127.0.0.1:3000/`. The private attempt records retain the exact objective text and bounds.

## Read-only observation

Execution `b304f85f-04e2-47f1-ac24-8b0208563a38` completed with Kane exit 0 and one terminal result. Kane session `101be711-2d32-4740-be35-58852d6992a1` reported four steps and 23.6550075 credits. The actual `final_state` was an object with string fields `initial_sender` and `initial_recipient` plus `url` and `currency_text`. The first normalizer rejected the extra keys. The updated normalizer checks the final URL when present and projects only the required names. Revalidation checked both raw stream hashes and the terminal result before producing a separate receipt. The first receipt was retained.

| Named field | Raw value | Integer cents |
| --- | --- | ---: |
| `initial_sender` | $1,000.00 | 100,000 |
| `initial_recipient` | $500.00 | 50,000 |

Both observations are available and provenance-bound. The read-only workflow has no applicable invariant verdict. [Revalidated receipt](evidence/phase-1b-observe.json)

The Kane evidence pack SHA-256 is `868d871b4100c4c82918758dc6398048a27d6e79f4801d56f5a5d235a6a0f6d5`. Raw stream, objective, and contract hashes are in the receipt.

## Seeded conservation

Execution `503b1393-9364-4dc7-949a-81147a1b354f`, Kane session `dd6b4efd-433e-4630-b6be-da31520b843d`, completed eight steps with Kane exit 0 and 26.6343425 credits. The stream records a reset, amount entry, submission, post-submit analysis, and an explicit completion assertion. The terminal state also contains a confirmation string beginning with “Transfer completed.” All four requested observations are available.

| Observation | Raw value | Integer cents |
| --- | --- | ---: |
| Alice before | $1,000.00 | 100,000 |
| Bob before | $500.00 | 50,000 |
| Alice after | $1,000.00 | 100,000 |
| Bob after | $600.00 | 60,000 |

**INV-001 VIOLATED.** Expected 150,000 cents, observed 160,000 cents, difference +10,000 cents. Kane's workflow status was `PASSED`. The Invariant command reports exit 1 for the contract violation. [Seeded transfer receipt](evidence/phase-1b-seeded-conservation.json)

The Kane evidence pack SHA-256 is `8e20d97c70023f371307bc0cfba1416d87e933cf9a9d83b832acfbfc8afea112`. The receipt records the raw stream hashes and uses the same contract hash as the read-only receipt.

## Corrected implementation

Execution `57a2f865-9b1c-4eaa-8a32-30a3d5bfb474`, Kane session `2a1fef03-c5cd-40ed-adf1-7c59f609a3e5`, completed 13 steps with Kane exit 0 and 33.714705 credits. The stream records the reset and the transfer completion assertion. The corrected run used the same objective SHA-256 and INV-001 contract SHA-256 as the seeded run. [Corrected transfer receipt](evidence/phase-1b-corrected.json)

| Observation | Raw value | Integer cents |
| --- | --- | ---: |
| Alice before | $1,000.00 | 100,000 |
| Bob before | $500.00 | 50,000 |
| Alice after | $900.00 | 90,000 |
| Bob after | $600.00 | 60,000 |

| Workflow | Kane | Observations | Expected total | Observed total | Difference | INV-001 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Seeded | PASSED | AVAILABLE | 150,000¢ | 160,000¢ | +10,000¢ | VIOLATED |
| Corrected | PASSED | AVAILABLE | 150,000¢ | 150,000¢ | 0¢ | SATISFIED |

The corrected Kane evidence pack SHA-256 is `9c03936b652f1d0e66e7e4aeb71d5ccd3afa1b0a16d36f5b29227722eb4e32dc`. The stdout, stderr, and contract hashes in all three sanitized receipts were checked against the retained files.

## Budget and scope

The three genuine Phase 1B runs reported **84.004055 credits** in total. Revalidation read the first run's retained streams locally. The browser workflows establish conservation behavior for the controlled $100 transfer. Idempotency remains covered by unit tests. This was a controlled comparison of existing implementations.

## Automated checks

| Command | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed |
| `npm.cmd test` | 17 passed, zero failed or skipped |
| `npm.cmd run build` | Passed |

The new tests cover terminal output arriving immediately before child closure, separate stderr capture, metadata filtering, missing named observations, and wrong-page rejection. The subprocess and parser inputs in these tests are synthetic.
