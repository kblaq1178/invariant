"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Archive } from "../../src/workspace/archive";
import { actorByState, executionRows, parseReceipt, sections, type BrowserResult, type Mode, type Receipt, type Section } from "../../src/workspace/receipts";
import { dollars, parseDollars } from "../../src/ledger/money";
import { diffLines } from "../../src/workspace/diff";
import { Projects } from "./projects";
import "./workspace.css";

const labels: Record<Section, string> = {
  overview: "Overview", projects: "Projects", contracts: "Contracts", executions: "Executions",
  repairs: "Repairs", evidence: "Evidence", sandbox: "LedgerLab",
};
const icons: Record<Section, string> = { overview: "◫", projects: "▱", contracts: "◇", executions: "≋", repairs: "⌁", evidence: "▤", sandbox: "□" };
const wording: Record<string, string> = {
  READY: "Ready", OBSERVING: "Observing", EVALUATING: "Evaluating", VIOLATION_DETECTED: "Violation detected",
  REPAIR_AUTHORIZED: "Repair authorized", REPAIRING: "Repairing", VALIDATING_PATCH: "Validating patch",
  REVERIFYING: "Re-verifying", VERIFIED: "Verified", REJECTED: "Rejected", FAILED: "Failed", INCONCLUSIVE: "Inconclusive",
};
const usd = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) ? dollars(value) : "—";
const credits = (value: number | null) => value === null ? "Unreported" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value);
const duration = (ms: number) => ms < 1000 ? ms + " ms" : ms < 60000 ? (ms / 1000).toFixed(1) + " s" :
  Math.floor(ms / 60000) + "m " + Math.floor(ms % 60000 / 1000) + "s";
const utc = (at: string) => at.slice(11, 23) + " UTC";
const balance = (run: BrowserResult, field: string) => run.observations?.[field]?.value ?? "—";
const asCents = (run: BrowserResult, field: string) => run.observations?.[field] ? parseDollars(balance(run, field), true).toLocaleString("en-US") : "—";

function Badge({ status }: { status: string }) {
  const tone = ["VERIFIED", "SATISFIED"].includes(status) ? "good" :
    ["VIOLATED", "FAILED"].includes(status) ? "bad" : ["REJECTED", "INCONCLUSIVE", "Unavailable"].includes(status) ? "warn" : "neutral";
  return <span className={"iw-badge iw-" + tone}><span aria-hidden="true" />{status}</span>;
}

function Copy({ value, label = "Copy", subtle = false }: { value: string; label?: string; subtle?: boolean }) {
  const [status, setStatus] = useState("");
  return <span className="iw-copy">
    <button type="button" className={subtle ? "iw-ghost" : "iw-button iw-secondary"} onClick={async () => {
      try { await navigator.clipboard.writeText(value); setStatus("Copied"); }
      catch { setStatus("Select the value to copy."); }
    }}>{status === "Copied" ? status : label}</button>
    <span className="iw-sr" aria-live="polite">{status}</span>
  </span>;
}

function Download({ payload, filename, label }: { payload: string; filename: string; label: string }) {
  return <button className="iw-button iw-secondary" type="button" onClick={() => {
    const file = new Blob([payload], { type: filename.endsWith(".json") ? "application/json" : "text/plain" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }}>{label} <span aria-hidden="true">↓</span></button>;
}

function Header({ label, title, children }: { label?: string; title: string; children?: ReactNode }) {
  return <div className="iw-page-head">
    {label && <p className="iw-kicker">{label}</p>}
    <h1>{title}</h1>
    {children && <p>{children}</p>}
  </div>;
}

function RuntimeDialog({ dialog }: { dialog: React.RefObject<HTMLDialogElement | null> }) {
  const id = useId();
  return <dialog ref={dialog} className="iw-dialog" aria-labelledby={id}>
    <div className="iw-panel-head"><div><p className="iw-kicker">LOCAL EXECUTION</p><h2 id={id}>Run with the CLI</h2></div>
      <form method="dialog"><button className="iw-button iw-secondary" aria-label="Close run instructions">Close</button></form>
    </div>
    <p>Run an approved command in your local PowerShell session. The workspace can open the resulting sanitized repair receipt from Evidence.</p>
    <div className="iw-command"><code>npm.cmd run verify -- observe</code><Copy value="npm.cmd run verify -- observe" /></div>
    <div className="iw-command"><code>npm.cmd run repair</code><Copy value="npm.cmd run repair" /></div>
    <p className="iw-muted">The repair loop reserves four sequential Kane runs. Phase 2 limits the checkout to six Kane runs, 500 reported credits, and two Codex attempts. Allow up to about 25 minutes for the four-run loop at its time limits. Start it only after reviewing the local budget.</p>
  </dialog>;
}

function Overview({ archive, mode, href, openRun }: { archive: Archive; mode: Mode; href: (section: Section) => string; openRun: () => void }) {
  const closed = archive.bundles[0].receipt;
  return <>
    <section className="iw-hero">
      <div className="iw-hero-copy">
        <p className="iw-kicker"><span className="iw-tick" /> {mode === "demo" ? "GUIDED BENCHMARK" : "BUSINESS INTEGRITY WORKSPACE"}</p>
        <h1>Correctness<br />beyond tests<span>.</span></h1>
        <p>{mode === "demo" ? "Watch a real browser transfer pass, see the rule it breaks, and follow the code change through re-verification." :
          "A workflow can pass while a business rule breaks. Invariant checks the state your application leaves behind."}</p>
        {closed.initial && <a href="#transition-heading" className="iw-hero-proof">
          <strong>The test passed. The money didn’t add up.</strong>
          <span>Kane <Badge status={closed.initial.workflow} /> INV-001 <Badge status={closed.initial.verdict.status} />
            <b className="iw-text-bad">+{usd(closed.initial.verdict.difference)}</b></span>
        </a>}
        <div className="iw-actions">
          {mode === "local" ? <button className="iw-button iw-primary" onClick={openRun}>Run verification <span aria-hidden="true">↗</span></button> :
            <Link className="iw-button iw-primary" href={href("executions")}>Start guided replay <span aria-hidden="true">↗</span></Link>}
          <Link className="iw-button iw-secondary" href={mode === "demo" ? "#transition-heading" : href("projects")}>{mode === "demo" ? "Compare results" : "Configure a project"}</Link>
        </div>
      </div>
      <article className="iw-system" aria-labelledby="system-heading">
        <div className="iw-system-top"><span className="iw-kicker">VERIFICATION PIPELINE</span><span className="iw-system-tag">LEDGERLAB</span></div>
        <h2 id="system-heading">From observation to repair</h2>
        {[
          ["01", "Kane", "Observes", "Real browser state"],
          ["02", "Invariant", "Evaluates", "Deterministic contracts"],
          ["03", "Codex", "Repairs", "Scoped implementation changes"],
          ["04", "Kane + Invariant", "Re-verify", "Re-observe and re-evaluate"],
        ].map(([step, name, verb, detail]) =>
          <div className="iw-system-row" key={name}><span className="iw-system-step">{step}</span><span><strong>{name} {verb.toLowerCase()}</strong><small>{detail}</small></span><span aria-hidden="true">↘</span></div>)}
        <div className="iw-system-bottom"><span>Latest bundled run</span><Badge status={closed.finalStatus} /></div>
      </article>
    </section>
    {closed.initial && closed.postRepair && <StateTransition seeded={closed.initial} repaired={closed.postRepair} />}
    {mode === "demo" && <section className="iw-panel iw-after">
      <div className="iw-panel-head"><div><p className="iw-kicker">WHAT CHANGED</p><h2>Codex repaired the balance update</h2></div>
        <Link href={href("repairs")} className="iw-button iw-secondary">Inspect repair ↗</Link></div>
      <p>The accepted patch adds the sender debit to the same transaction update that credits the recipient.</p>
      <Diff value={archive.bundles[0].diff} />
    </section>}
    {mode === "demo" && closed.postRepair && <ScenarioMatrix receipt={closed} />}
    {mode === "local" && <section className="iw-summary-grid" aria-label="Available evidence">
      <Link className="iw-summary" href={href("contracts")}><span className="iw-kicker">CONTRACTS</span><strong>Conservation & idempotency</strong><span>1 browser-verified · 1 unit-tested · 3 planned</span></Link>
      <Link className="iw-summary" href={href("repairs")}><span className="iw-kicker">PHASE 2 BENCHMARK</span><strong>Evidence-driven repair</strong><span>Review the patch and three re-verified amounts</span></Link>
    </section>}
  </>;
}

function StateTransition({ seeded, repaired }: { seeded: BrowserResult; repaired: BrowserResult }) {
  const [stage, setStage] = useState<"seeded" | "repaired">("seeded");
  const run = stage === "seeded" ? seeded : repaired;
  const gap = typeof run.verdict.difference === "number" ? run.verdict.difference : null;
  return <section aria-labelledby="transition-heading" className="iw-transition">
    <div className="iw-section-head">
      <div><p className="iw-kicker">PHASE 2 · HISTORICAL BENCHMARK</p><h2 id="transition-heading">Recorded balance comparison</h2></div>
      <div className="iw-switch" role="group" aria-label="Select transfer outcome">
        <button type="button" aria-pressed={stage === "seeded"} onClick={() => setStage("seeded")}>Seeded defect</button>
        <button type="button" aria-pressed={stage === "repaired"} onClick={() => setStage("repaired")}>After repair</button>
      </div>
    </div>
    <div className="iw-transition-panel">
      <div className="iw-transition-meta">
        <span><b>INV-001</b> Conservation <span className="iw-muted">/ $100 transfer</span></span>
        <span>Kane workflow <Badge status={run.workflow} /></span>
        <span>Invariant <Badge status={run.verdict.status} /></span>
      </div>
      <dl className="iw-benchmark-sums">
        <div><dt>Expected combined balance</dt><dd>{usd(run.verdict.expected)}</dd></div>
        <div><dt>Observed combined balance</dt><dd>{usd(run.verdict.observed)}</dd></div>
        <div><dt>Unexplained change</dt><dd className={gap ? "iw-text-bad" : "iw-text-good"}>{gap && gap > 0 ? "+" : ""}{usd(gap)}</dd></div>
      </dl>
      <div className="iw-state-grid">
        {(["before", "after"] as const).map((phase) => <div className="iw-state" key={phase}>
          <h3>{phase === "before" ? "Before transfer" : "After transfer"}</h3>
          <dl><div><dt>Alice</dt><dd>{balance(run, phase + "_sender")}</dd></div>
            <div><dt>Bob</dt><dd>{balance(run, phase + "_recipient")}</dd></div>
            <div className="iw-state-total"><dt>Combined</dt><dd>{usd(phase === "before" ? run.verdict.expected : run.verdict.observed)}</dd></div></dl>
        </div>)}
        <span className="iw-state-arrow" aria-hidden="true">→</span>
      </div>
    </div>
  </section>;
}

function Contracts({ archive }: { archive: Archive }) {
  const [index, select] = useState(0);
  const contract = archive.catalog.contracts[index];
  const support = index === 0 ? "Browser verified" : index === 1 ? "Unit tested" : "Planned";
  const relationship = index === 0 ? "before.sender + before.recipient = after.sender + after.recipient" :
    index === 1 ? "same transaction ID → same balances and successful transaction count" : contract.expectedRelationship.rule;
  return <>
    <Header label="CONTRACT LIBRARY" title="Business rules">Inspect the relationships Invariant evaluates from observed application state.</Header>
    <div className="iw-inspector">
      <div className="iw-list" role="group" aria-label="Choose a contract">
        {archive.catalog.contracts.map((item, key) => <button key={item.id} type="button" aria-pressed={key === index} onClick={() => select(key)}>
          <span className="iw-kicker">{item.id}</span><strong>{item.name}</strong><span aria-hidden="true">→</span>
        </button>)}
      </div>
      <article className="iw-panel">
        <div className="iw-panel-head"><div><p className="iw-kicker">{contract.id} · V{archive.catalog.version}</p><h2>{contract.name}</h2></div><Badge status={support} /></div>
        <p>{contract.description}</p>
        {index === 1 && <p className="iw-note">Coverage comes from deterministic unit tests. A Kane retry workflow has yet to verify this contract.</p>}
        {index > 1 && <p className="iw-note">This contract is scaffolded. Its operator cannot produce a satisfied or violated result.</p>}
        <h3>Mathematical relationship</h3><pre className="iw-code"><code>{relationship}</code></pre>
        <h3>Required observations</h3><ul className="iw-token-list">{contract.requiredObservations.map((item) => <li key={item}>{item}</li>)}</ul>
        <h3>Workflow objective <span className="iw-muted">/ {contract.severity} severity</span></h3>
        <p>{index === 0 ? archive.bundles[0].receipt.objective : index === 1 ?
          "Retry the same successful transaction and record its identifier, both balances, and successful transaction count before and after." : contract.objective}</p>
        <h3>Contract catalog SHA-256</h3><Identifier value={archive.contractSha256} />
      </article>
    </div>
  </>;
}

function Identifier({ value }: { value: string }) {
  return <span className="iw-identifier"><code>{value}</code><Copy value={value} subtle /></span>;
}

function SelectRun({ bundles, value, change }: { bundles: { label: string; receipt: Receipt }[]; value: number; change: (index: number) => void }) {
  return <label className="iw-select"><span>Historical execution</span><select value={value} onChange={(event) => change(Number(event.target.value))}>
    {bundles.map(({ label, receipt }, index) => <option key={receipt.runId} value={index}>{label}</option>)}
  </select></label>;
}

function StageBalances({ result }: { result: BrowserResult }) {
  return <div className="iw-stage-balances">
    <span>Alice <b>{balance(result, "before_sender")} → {balance(result, "after_sender")}</b></span>
    <span>Bob <b>{balance(result, "before_recipient")} → {balance(result, "after_recipient")}</b></span>
  </div>;
}

function StageEvidence({ state, receipt }: { state: Receipt["events"][number]["state"]; receipt: Receipt }) {
  const seeded = receipt.initial;
  const repaired = receipt.postRepair;
  switch (state) {
    case "READY": return <><h3>Seeded benchmark prepared</h3><p>INV-001 compares the combined balance before and after the same $100 transfer.</p></>;
    case "OBSERVING": return <><h3>Kane runs the transfer</h3><p>{receipt.objective}</p>
      {seeded && <Identifier value={seeded.executionId} />}</>;
    case "EVALUATING": return <><h3>Named observations enter INV-001</h3>
      {seeded && <><Badge status={seeded.workflow} /><StageBalances result={seeded} /></>}</>;
    case "VIOLATION_DETECTED": return <><h3>The observed total increased</h3>
      {seeded && <><Badge status={seeded.verdict.status} /><p>Expected {usd(seeded.verdict.expected)} · observed {usd(seeded.verdict.observed)} · difference {usd(seeded.verdict.difference)}</p></>}</>;
    case "REPAIR_AUTHORIZED": return <><h3>Repair scope authorized</h3><p>Allowed file <code>{receipt.allowedPaths.join(", ")}</code>. The packet links the observed violation to the protected contract.</p>
      {receipt.packetSha256 && <Identifier value={receipt.packetSha256} />}</>;
    case "REPAIRING": return <><h3>Codex receives the evidence packet</h3>
      {receipt.repair && <p>{receipt.repair.completed ? "Completed" : "Incomplete"} · exit {receipt.repair.exitCode ?? "unreported"} · {duration(receipt.repair.durationMs)}</p>}</>;
    case "VALIDATING_PATCH": return <><h3>{receipt.patch ? "Patch accepted" : "Local validator blocked the patch"}</h3>
      <p>{receipt.patch ? "The accepted change adds the sender debit to the transfer state update. Scope, protected hashes and local behavior checks passed." :
        "The first candidate reached the local validator. A name collision in the validation harness prevented re-verification."}</p>
      {receipt.patch && <Identifier value={receipt.patch.diffSha256} />}</>;
    case "REVERIFYING": return <><h3>Kane reruns the same objective</h3>
      {repaired ? <><Badge status={repaired.workflow} /><StageBalances result={repaired} /><Identifier value={repaired.executionId} /></> :
        <p>No admissible re-verification result was recorded.</p>}</>;
    case "VERIFIED": return <><h3>Conservation restored</h3>
      {repaired && <><Badge status={repaired.verdict.status} /><p>Combined balance held at {usd(repaired.verdict.observed)}. The $10 and $250 checks also satisfied INV-001.</p></>}</>;
    default: return <><h3>{wording[state]}</h3><p>The recorded attempt ended without a verified repair.</p></>;
  }
}

function Timeline({ receipt }: { receipt: Receipt }) {
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = receipt.events.length - 1;
  const event = receipt.events[at];
  const start = Date.parse(receipt.events[0].at);
  useEffect(() => {
    if (!playing || at >= last) return;
    const timer = setTimeout(() => {
      setAt(at + 1);
      if (at + 1 === last) setPlaying(false);
    }, 2400);
    return () => clearTimeout(timer);
  }, [at, last, playing]);
  return <section className="iw-panel">
    <div className="iw-panel-head"><div><p className="iw-kicker">RECORDED EVENTS</p><h2>Historical replay</h2></div>
      <Badge status={receipt.finalStatus} /></div>
    <p className="iw-muted">Replay steps through recorded events at a fixed pace. Recorded on <time dateTime={receipt.events[0].at}>{receipt.events[0].at.slice(0, 10)} UTC</time>.</p>
    <div className="iw-replay-controls">
      <button className="iw-button iw-primary" type="button" onClick={() => {
        if (playing) setPlaying(false);
        else { if (at === last) setAt(0); setPlaying(true); }
      }}>{playing ? "Pause replay" : at > 0 && at < last ? "Resume replay" : "Play historical replay"}</button>
      <button className="iw-button iw-secondary" type="button" onClick={() => { setPlaying(false); setAt(Math.min(at + 1, last)); }} disabled={at === last}>Next event</button>
      <button className="iw-button iw-secondary" type="button" onClick={() => { setPlaying(false); setAt(0); }} disabled={at === 0 && !playing}>Reset replay</button>
    </div>
    <div className="iw-replay-progress"><p className="iw-replay-status" aria-live="polite">Replay event {at + 1} of {receipt.events.length} · {wording[event.state]} · {actorByState[event.state]}</p>
      <progress aria-label="Historical replay progress" value={at + 1} max={receipt.events.length} /></div>
    <div className="iw-stage" aria-label="Selected recorded stage"><StageEvidence state={event.state} receipt={receipt} /></div>
    <ol className="iw-timeline">{receipt.events.map((step, index) => <li key={step.state}>
      <button type="button" aria-current={index === at ? "step" : undefined} onClick={() => { setPlaying(false); setAt(index); }}>
        <span className="iw-event-number">{String(index + 1).padStart(2, "0")}</span>
        <span><strong>{wording[step.state]}</strong><small>{actorByState[step.state]}</small></span>
        <time dateTime={step.at}>{utc(step.at)}</time>
        <span className="iw-event-elapsed">+{duration(Date.parse(step.at) - start)}</span>
      </button>
    </li>)}</ol>
  </section>;
}

function Executions({ archive }: { archive: Archive }) {
  const [selected, change] = useState(0);
  const bundle = archive.bundles[selected];
  return <>
    <Header label="EXECUTION HISTORY" title="Recorded runs">Follow the evidence handoff from browser observation through deterministic verification.</Header>
    <SelectRun bundles={archive.bundles} value={selected} change={change} />
    <div className="iw-run-strip"><div><span className="iw-kicker">RUN ID</span><Identifier value={bundle.receipt.runId} /></div>
      <div><span className="iw-kicker">ELAPSED</span><strong>{duration(bundle.receipt.elapsedMs)}</strong></div>
      <div><span className="iw-kicker">REPORTED CREDITS</span><strong>{credits(bundle.receipt.creditsConsumed)}</strong></div></div>
    <Timeline key={bundle.receipt.runId} receipt={bundle.receipt} />
    <section className="iw-panel iw-after"><h2>Browser executions</h2>
      {executionRows(bundle.receipt).map(({ label, result }) => <div className="iw-execution-row" key={result.executionId}>
        <strong>{label}</strong><Identifier value={result.executionId} /><Badge status={result.workflow} />
        <span className="iw-muted">{duration(archive.metadata[result.executionId].durationSeconds * 1000)}</span>
      </div>)}
    </section>
    {bundle.receipt.postRepair && <ScenarioMatrix receipt={bundle.receipt} />}
  </>;
}

function Diff({ value }: { value: string }) {
  return <pre className="iw-code iw-diff" aria-label="Source diff" tabIndex={0}><code>
    {diffLines(value).map(({ text, before, after, tone }, index) => <span key={index} className={"iw-diff-line iw-diff-" + tone}>
      <span aria-hidden="true">{before}</span><span aria-hidden="true">{after}</span><span>{text || " "}</span>
    </span>)}
  </code></pre>;
}

function Repairs({ archive }: { archive: Archive }) {
  const [selected, change] = useState(0);
  const { receipt, diff, packet, note } = archive.bundles[selected];
  return <>
    <Header label="REPAIR HISTORY" title="Evidence-driven repair">Review the evidence Codex received, the change it made, and the checks that followed.</Header>
    <SelectRun bundles={archive.bundles} value={selected} change={change} />
    <div className="iw-run-strip">
      <div><span className="iw-kicker">CODEX EXECUTION</span><strong>{receipt.repair?.completed ? "Completed" : "Incomplete"} · {duration(receipt.repair?.durationMs ?? 0)}</strong></div>
      <div><span className="iw-kicker">PATCH VALIDATION</span><Badge status={receipt.patch?.localChecks ?? receipt.finalStatus} /></div>
      <div><span className="iw-kicker">RE-VERIFICATION</span><Badge status={receipt.postRepair?.verdict.status ?? "Unavailable"} /></div>
    </div>
    {selected === 1 && <p className="iw-note">{note}. A name collision in the local validation harness prevented the candidate from reaching Kane. The original attempt remains in the archive.</p>}
    <div className="iw-two">
      <article className="iw-panel"><h2>Authorized scope</h2><ul className="iw-token-list">{receipt.allowedPaths.map((path) => <li key={path}>{path}</li>)}</ul>
        <h3>{receipt.patch ? "Validated changed files" : "Candidate changed file"}</h3><ul className="iw-token-list">{(receipt.patch?.changedFiles ?? receipt.allowedPaths).map((path) => <li key={path}>{path}</li>)}</ul>
      </article>
      <article className="iw-panel"><h2>Protected contract</h2><p>The recorded contract hash matches the bundled catalog.</p>
        <Identifier value={receipt.contractSha256} /><p className="iw-muted">The Windows sandbox verified the original repository read denial. The separate patch gate checked file scope and protected hashes.</p>
      </article>
    </div>
    <section className="iw-panel iw-after">
      <div className="iw-panel-head"><div><h2>Actual source diff</h2><p>{receipt.patch ? "The sender debit and recipient credit are applied in one balance update." : "Candidate diff from the recorded rejected attempt."}</p></div>
        <div className="iw-actions iw-inline-actions"><Copy value={diff} label="Copy diff" /><Download payload={diff} filename={"invariant-" + receipt.runId + ".diff"} label="Export diff" /></div></div>
      <Diff value={diff} />
    </section>
    <details className="iw-panel iw-after iw-details" open><summary>Inspect the repair packet</summary><p>The reconstructed packet matches the original packet SHA-256.</p>
      {receipt.packetSha256 && <Identifier value={receipt.packetSha256} />}<pre className="iw-code"><code>{packet}</code></pre>
    </details>
    {receipt.postRepair && <ScenarioMatrix receipt={receipt} />}
  </>;
}

function ScenarioMatrix({ receipt }: { receipt: Receipt }) {
  const results = [...receipt.scenarios, ...(receipt.postRepair ? [{ amountCents: 10000, result: receipt.postRepair }] : [])]
    .sort((a, b) => a.amountCents - b.amountCents);
  return <section className="iw-panel iw-after" aria-labelledby="scenario-heading"><div className="iw-panel-head">
    <div><p className="iw-kicker">POST-REPAIR COVERAGE</p><h2 id="scenario-heading">Conservation scenarios</h2></div>
    <span className="iw-system-tag">INV-001</span></div>
    <p className="iw-muted">The same conservation contract evaluated each of these recorded transfers.</p>
    <div className="iw-table-scroll" tabIndex={0} aria-label="Scrollable conservation scenario matrix"><table className="iw-table">
      <thead><tr><th scope="col">Amount</th><th scope="col">Alice</th><th scope="col">Bob</th><th scope="col">Expected / observed</th><th scope="col">Kane</th><th scope="col">Invariant</th></tr></thead>
      <tbody>{results.map(({ amountCents, result }) => <tr key={amountCents}><th scope="row">{usd(amountCents)}</th>
        <td>{balance(result, "before_sender")} → {balance(result, "after_sender")}</td>
        <td>{balance(result, "before_recipient")} → {balance(result, "after_recipient")}</td>
        <td>{usd(result.verdict.expected)} / {usd(result.verdict.observed)}</td><td><Badge status={result.workflow} /></td>
        <td><Badge status={result.verdict.status} /></td></tr>)}</tbody>
    </table></div>
  </section>;
}

type EvidenceEntry = { label: string; receipt: Receipt; download: string; diff?: string };

function InventoryEvidence({ runs }: { runs: Archive["inventory"] }) {
  const [selected, setSelected] = useState(0);
  const run = runs[selected];
  return <>
    <section className="iw-panel"><div className="iw-panel-head"><div><p className="iw-kicker">CROSS-APPLICATION CHECK</p>
      <h2>Warehouse stock conservation</h2></div><Link className="iw-button iw-secondary" href="/inventory">Open inventory sandbox ↗</Link></div>
      <p>LedgerLab and Warehouse inventory use the same Kane-to-Invariant architecture. These two stock transfers are a controlled comparison of existing implementations.</p>
      <div className="iw-table-scroll" tabIndex={0} aria-label="Scrollable inventory comparison"><table className="iw-table">
        <thead><tr><th scope="col">Case</th><th scope="col">Expected / observed</th><th scope="col">Change</th><th scope="col">Kane</th><th scope="col">Invariant</th></tr></thead>
        <tbody>{runs.map((entry) => <tr key={entry.executionId}><th scope="row">{entry.label}</th>
          <td>{entry.verdict.expected} / {entry.verdict.observed} units</td><td>{entry.verdict.difference ?? "—"}</td>
          <td><Badge status={entry.workflow} /></td><td><Badge status={entry.verdict.status} /></td></tr>)}</tbody>
      </table></div>
    </section>
    <section className="iw-panel iw-after"><div className="iw-panel-head"><h2>Inventory execution</h2>
      <Download payload={run.download} filename={"invariant-" + run.executionId + ".json"} label="Export inventory JSON" /></div>
      <label className="iw-select iw-after"><span>Inventory case</span><select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
        {runs.map((entry, index) => <option key={entry.executionId} value={index}>{entry.label}</option>)}
      </select></label>
      <dl className="iw-pairs">
        <div><dt>Execution ID</dt><dd><Identifier value={run.executionId} /></dd></div>
        <div><dt>Kane session ID</dt><dd><Identifier value={run.sessionId} /></dd></div>
        <div><dt>Kane duration and credits</dt><dd>{duration(run.durationSeconds * 1000)} · {credits(run.reportedCredits)} credits</dd></div>
        <div><dt>Completed</dt><dd><time dateTime={run.completedAt}>{run.completedAt}</time></dd></div>
        <div><dt>Contract SHA-256</dt><dd><Identifier value={run.contractSha256} /></dd></div>
        <div><dt>Objective SHA-256</dt><dd><Identifier value={run.objectiveSha256} /></dd></div>
        <div><dt>Named observations from stdout</dt><dd><Identifier value={run.stdoutSha256} /></dd></div>
        {run.observations.map(({ field, raw }) => <div key={field}><dt><code>{field}</code></dt><dd>{raw} units</dd></div>)}
      </dl>
    </section>
  </>;
}

function Evidence({ archive, mode }: { archive: Archive; mode: Mode }) {
  const [application, setApplication] = useState<"ledger" | "inventory">("ledger");
  const [imports, setImports] = useState<EvidenceEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const [execution, setExecution] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const bundles = [...archive.bundles, ...imports];
  const bundle = bundles[selected];
  const { receipt } = bundle;
  const rows = executionRows(receipt);
  const run = rows[execution]?.result;
  const timing = run && archive.metadata[run.executionId];
  const builtIn = selected < archive.bundles.length;
  const fileInput = useId();
  async function ingest(file: File) {
    setLoading(true);
    setMessage("");
    try {
      if (file.size > 512 * 1024) throw new Error("This receipt exceeds the 512 KiB limit.");
      const text = await file.text();
      let candidate: unknown;
      try { candidate = JSON.parse(text); } catch { throw new Error("This file is not valid JSON."); }
      const value = parseReceipt(candidate, archive.contractSha256, archive.objectiveSha256, archive.scenarioHashes);
      const existing = bundles.findIndex(({ receipt }) => receipt.runId === value.runId);
      if (existing >= 0) {
        setSelected(existing);
        setMessage("This receipt is already in the workspace.");
      } else {
        setImports([...imports, { label: "Imported · " + value.runId.slice(0, 8), receipt: value, download: JSON.stringify(value, null, 2) }]);
        setSelected(bundles.length);
        setMessage("Receipt opened locally. Imported evidence has not been independently authenticated.");
      }
      setExecution(0);
    } catch (error) {
      setMessage(error instanceof Error && ["This receipt exceeds the 512 KiB limit.", "This file is not valid JSON."].includes(error.message) ?
        error.message : "This receipt could not be validated against the Phase 2 contract.");
    } finally {
      setLoading(false);
    }
  }
  return <>
    <Header label="EVIDENCE EXPLORER" title="Inspect the record">Trace each verdict back to named observations, execution IDs, and integrity hashes.</Header>
    <div className="iw-switch iw-evidence-apps" role="group" aria-label="Evidence application">
      <button type="button" aria-pressed={application === "ledger"} onClick={() => setApplication("ledger")}>LedgerLab</button>
      <button type="button" aria-pressed={application === "inventory"} onClick={() => setApplication("inventory")}>Warehouse inventory</button>
    </div>
    {application === "inventory" ? <InventoryEvidence runs={archive.inventory} /> : <>
    <div className="iw-tools">
      <SelectRun bundles={bundles} value={selected} change={(index) => { setSelected(index); setExecution(0); }} />
      {mode === "local" && <div className="iw-import">
        <input id={fileInput} className="iw-file" type="file" accept=".json,application/json" disabled={loading} onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void ingest(file);
          event.target.value = "";
        }} />
        <label htmlFor={fileInput} className="iw-button iw-secondary">{loading ? "Checking receipt…" : "Open local receipt"}</label>
      </div>}
      <Download payload={bundle.download} filename={"invariant-" + receipt.runId + ".json"} label="Export JSON" />
      {bundle.diff && <Download payload={bundle.diff} filename={"invariant-" + receipt.runId + ".diff"} label="Export diff" />}
    </div>
    {message && <p role="status" className="iw-note">{message}</p>}
    {!builtIn && <p className="iw-note">Imported receipt · local file projection. The verdict was recomputed from its observations. Origin and diff content have not been independently authenticated.</p>}
    <div className="iw-two">
      <article className="iw-panel"><div className="iw-panel-head"><h2>Run receipt</h2><Badge status={builtIn ? receipt.finalStatus : "IMPORTED"} /></div>
        <Identifier value={receipt.runId} /><dl className="iw-pairs">
          <div><dt>Execution time</dt><dd>{duration(receipt.elapsedMs)}</dd></div><div><dt>Reported Kane credits</dt><dd>{credits(receipt.creditsConsumed)}</dd></div>
          <div><dt>Origin</dt><dd>Seeded benchmark</dd></div>
        </dl>
      </article>
      <article className="iw-panel"><h2>Integrity records</h2><h3>Contract SHA-256</h3><Identifier value={receipt.contractSha256} />
        <h3>Objective SHA-256</h3><Identifier value={receipt.objectiveSha256} />
        {receipt.packetSha256 && <><h3>Repair packet SHA-256</h3><Identifier value={receipt.packetSha256} /></>}
        {receipt.patch && <><h3>Source diff SHA-256</h3><Identifier value={receipt.patch.diffSha256} /></>}
      </article>
    </div>
    <section className="iw-panel iw-after">
      <div className="iw-panel-head"><h2>Named observations</h2>
        {rows.length > 0 && <label className="iw-select"><span>Browser execution</span>
          <select value={execution} onChange={(event) => setExecution(Number(event.target.value))}>
            {rows.map(({ label, result }, index) => <option key={result.executionId} value={index}>{label}</option>)}
          </select></label>}
      </div>
      {run ? <>
        <div className="iw-observation-head"><Badge status={run.workflow} /><Badge status={run.verdict.status} />
          <span className="iw-muted">Reported credits {credits(run.creditsConsumed)}</span>
          {timing && <span className="iw-muted">{duration(timing.durationSeconds * 1000)} · <time dateTime={timing.completedAt}>{utc(timing.completedAt)}</time></span>}
        </div>
        <dl className="iw-pairs"><div><dt>Execution ID</dt><dd><Identifier value={run.executionId} /></dd></div>
          {run.sessionId && <div><dt>Kane session ID</dt><dd><Identifier value={run.sessionId} /></dd></div>}
          {run.kaneRunId && <div><dt>Kane run</dt><dd><code>{run.kaneRunId}</code></dd></div>}
          <div><dt>Browser objective SHA-256</dt><dd><Identifier value={run.objectiveSha256} /></dd></div>
          <div><dt>Stdout SHA-256</dt><dd><Identifier value={run.stdoutSha256} /></dd></div>
          <div><dt>Stderr SHA-256</dt><dd><Identifier value={run.stderrSha256} /></dd></div></dl>
        {run.observations ? <div className="iw-table-scroll" tabIndex={0} aria-label="Scrollable named observations">
          <table className="iw-table"><thead><tr><th scope="col">Named field</th><th scope="col">Raw value</th><th scope="col">Cents</th><th scope="col">Provenance</th></tr></thead>
            <tbody>{Object.entries(run.observations).map(([field, observation]) => <tr key={field}><th scope="row"><code>{field}</code></th>
              <td>{observation.value}</td><td>{asCents(run, field)}</td><td><details><summary>Kane · {observation.provenance.executionId.slice(0, 8)}</summary>
                <p><code>{observation.provenance.field}</code> from the stdout hash above.</p></details></td></tr>)}</tbody>
          </table></div> : <p className="iw-note">This execution did not provide admissible named observations.</p>}
      </> : <p className="iw-note">This receipt contains no browser execution.</p>}
    </section>
    {bundle.diff && <details className="iw-panel iw-after iw-details"><summary>Source diff</summary><Diff value={bundle.diff} /></details>}
    </>}
  </>;
}

function Sandbox({ mode }: { mode: Mode }) {
  return <>
    <Header label="APPLICATION UNDER TEST" title="LedgerLab">A fictional ledger for observing the state changes behind a successful transfer.</Header>
    <div className="iw-two">
      <article className="iw-panel"><p className="iw-kicker">BROWSER SANDBOX</p><h2>Explore the ledger</h2>
        <p>Inspect account balances, submit a fictional transfer, or reset the demo state.</p>
        <Link className="iw-button iw-primary" href="/ledgerlab">Open LedgerLab <span aria-hidden="true">↗</span></Link></article>
      <article className="iw-panel"><p className="iw-kicker">SEEDED FIXTURES</p><h2>Controlled defects</h2>
        <p>The two fixtures model distinct business-rule failures. They are labeled separately from the corrected ledger.</p>
        <div className="iw-actions"><Link className="iw-button iw-secondary" href="/fixtures/conservation">Conservation fixture</Link>
          <Link className="iw-button iw-secondary" href="/fixtures/idempotency">Idempotency fixture</Link></div></article>
    </div>
    <iframe className="iw-sandbox-frame" src="/ledgerlab" title="Interactive LedgerLab sandbox" />
    {mode === "demo" && <p className="iw-note">LedgerLab interactions are browser-local. Public demo pages replay recorded agent evidence.</p>}
  </>;
}

export function Workspace({ archive, mode, active }: { archive: Archive; mode: Mode; active: Section }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const href = (section: Section) => (mode === "local" ? "/workspace" : "/demo") +
    (section === "overview" ? "" : "/" + section);
  const openRun = () => dialog.current?.showModal();
  const panels: Record<Section, ReactNode> = {
    overview: <Overview archive={archive} mode={mode} href={href} openRun={openRun} />,
    projects: mode === "local" ? <Projects /> : null,
    contracts: <Contracts archive={archive} />,
    executions: <Executions archive={archive} />,
    repairs: <Repairs archive={archive} />,
    evidence: <Evidence archive={archive} mode={mode} />,
    sandbox: <Sandbox mode={mode} />,
  };
  return <div className="iw">
    <a href="#workspace-main" className="iw-skip">Skip to content</a>
    <aside className="iw-sidebar">
      <Link href={href("overview")} className="iw-brand"><span className="iw-brand-mark" aria-hidden="true">I</span><span>INVARIANT</span></Link>
      <p className="iw-nav-label">WORKSPACE</p>
      <nav aria-label="Workspace">{sections.filter((section) => mode === "local" || section !== "projects").map((section) =>
        <Link href={href(section)} key={section} aria-current={section === active ? "page" : undefined}>
          <span aria-hidden="true">{icons[section]}</span>{labels[section]}
        </Link>)}</nav>
      <div className="iw-sidebar-foot"><span className="iw-app-icon" aria-hidden="true">L</span><span><strong>LedgerLab</strong><small>Application under test</small></span></div>
    </aside>
    <div className="iw-mainwrap">
      <div className="iw-topbar"><div><span>Workspace</span><span aria-hidden="true">/</span><strong>{labels[active]}</strong></div>
        <div><span className="iw-mode"><span aria-hidden="true" />{mode === "demo" ? "PUBLIC DEMO" : "LOCAL WORKSPACE"}</span>
          {mode === "local" && <Link href="/demo" className="iw-mode-link">Public demo ↗</Link>}</div></div>
      <main id="workspace-main" className="iw-main" tabIndex={-1}>
        {mode === "demo" && <p className="iw-demo-note">Read-only evidence · recorded runs and replay</p>}
        {panels[active]}
        <footer className="iw-footer"><span>Invariant / LedgerLab</span><span>{mode === "demo" ? "Public demonstration" : "Historical evidence workspace"}</span></footer>
      </main>
    </div>
    {mode === "local" && <RuntimeDialog dialog={dialog} />}
  </div>;
}
