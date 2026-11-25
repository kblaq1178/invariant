# Phase 1 verification

## Automated checks

The automated suite covers corrected and seeded transactions, money parsing, safe arithmetic, provenance conflicts, missing observations, duplicate and malformed terminal events, interrupted streams, and infrastructure failures. Parser streams in the unit tests are synthetic and stay in the test source.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

TypeScript checking, lint and production build passed. The automated suite passed **15 of 15** tests with zero failures or skips.

## Browser protocol

The first objective reads visible balances only. The second captures the two starting balances, submits one $100 Alice-to-Bob transfer, confirms completion, and captures both resulting balances. The optional third objective repeats the same steps against the deliberately seeded conservation fixture. Kane receives observation and interaction instructions. Invariant computes the conservation verdict using extracted values.

Each run uses desktop agent mode and headless Edge. The read-only run has an eight-step, 100-second limit. Each transfer run has an 18-step, 150-second limit. The adapter adds a ten-second watchdog margin around the CLI timeout. Receipts link each value to the execution UUID, its named field, and the SHA-256 of actual stdout.

## Actual execution

The production app answered HTTP 200 on loopback. Kane CLI 0.10.9 verified the existing sign-in and reported 10,179.9117 credits before the observation attempt.

| Objective | Workflow | Observations | Invariant |
| --- | --- | --- | --- |
| Read-only homepage | Timed out under the adapter watchdog. Three steps reported complete | Unavailable. The stream contained zero terminal result events | No contract applies to the read-only objective |
| Corrected $100 transfer | Unexecuted | Unavailable | INV-001 unverified |
| Seeded conservation transfer | Unexecuted | Unavailable | INV-001 unverified in browser |

The captured progress confirms navigation, a step that mentions Bob, and a wait. It contains no terminal payload, so this attempt could neither establish the extraction format in practice nor provide admissible balance values. The adapter recorded exit code 1 and an elapsed watchdog limit of 110 seconds. The timeout stop condition ended browser verification after one actual attempt.

Execution ID `118984c4-e2a7-44a5-a1c8-a9c30434b1da` links the [sanitized receipt](evidence/phase-1-observe.json) to the private stdout and stderr. Their SHA-256 digests and the catalog digest were checked against the receipt. The reported account balance fell from 10,179.9117 to 10,161.5057, a decrease of **18.4060 credits**. The interrupted execution had no terminal event to confirm a per-run charge. Raw streams and execution metadata remain in the ignored local run directory.

The two seeded defects and their deterministic violations are exercised in unit tests. INV-002 has no genuine browser verdict in Phase 1. Review the stalled read-only workflow before authorizing a new verification attempt. A complete capture of both initial balances is the prerequisite for the transfer workflow.
