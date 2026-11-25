"use client";

import { useId, useState, useSyncExternalStore } from "react";
import ledger from "../../examples/ledgerlab.project.json";
import inventory from "../../examples/inventory.project.json";
import stockTransfer from "../../examples/inventory-transfer.project.json";
import { exportProject, importProject, parseProject, type Project } from "../../src/projects/config";

const examples = [parseProject(ledger), parseProject(inventory), parseProject(stockTransfer)];
const descriptions = ["Genuine INV-001 browser evidence is available in the recorded benchmark.",
  "This example has deterministic fixture coverage. Browser evidence has not been recorded.",
  "Genuine Kane captures for the seeded and corrected stock transfer are available in Evidence."];
const storageKey = "invariant.projects.v1";
const change = "invariant-projects-changed";
type Saved = { id: string; project: Project };
type Draft = Omit<Project, "observations" | "contract"> & {
  observations: string; operator: Project["contract"]["operator"]; format: Project["contract"]["format"]; left: string; right: string;
};
const draftFrom = (project: Project): Draft => ({
  schemaVersion: 1, name: project.name, description: project.description, url: project.url, objective: project.objective,
  observations: project.observations.join(", "), operator: project.contract.operator, format: project.contract.format,
  left: project.contract.left.join(", "), right: project.contract.right.join(", "),
});
const empty: Draft = { schemaVersion: 1, name: "", description: "", url: "", objective: "",
  observations: "", operator: "equality", format: "integer", left: "", right: "" };
const split = (raw: string) => raw.split(",").map((field) => field.trim());
function checkDraft(draft: Draft) {
  return parseProject({ schemaVersion: 1, name: draft.name, description: draft.description, url: draft.url,
    objective: draft.objective, observations: split(draft.observations),
    contract: { operator: draft.operator, format: draft.format, left: split(draft.left), right: split(draft.right) } });
}
function snapshot() {
  try { return localStorage.getItem(storageKey) ?? "[]"; } catch { return "[]"; }
}
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(change, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(change, notify); };
}
function loadSaved(data: string): Saved[] {
  try {
    const input: unknown = JSON.parse(data);
    if (!Array.isArray(input)) return [];
    return input.slice(0, 20).flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object" || !("id" in entry) || !("project" in entry) ||
          typeof entry.id !== "string" || !/^[a-f0-9-]{36}$/.test(entry.id)) return [];
      try { return [{ id: entry.id, project: parseProject(entry.project) }]; } catch { return []; }
    });
  } catch { return []; }
}

export function Projects() {
  const saved = loadSaved(useSyncExternalStore(subscribe, snapshot, () => "[]"));
  const [draft, setDraft] = useState(() => draftFrom(examples[0]));
  const [selection, setSelection] = useState("example-0");
  const [feedback, setFeedback] = useState<{ text: string; error: boolean }>();
  const importId = useId();
  const isBuiltIn = selection.startsWith("example-");
  const update = (field: keyof Draft, value: string) => {
    setDraft({ ...draft, [field]: value });
    setFeedback(undefined);
  };
  const choose = (id: string, value: Draft) => { setSelection(id); setDraft(value); setFeedback(undefined); };
  const report = (text: string) => setFeedback({ text, error: false });
  function action(operation: (project: Project) => void) {
    try { operation(checkDraft(draft)); }
    catch (error) { setFeedback({ error: true, text: error instanceof Error ? error.message : "Project could not be saved." }); }
  }
  function save(project: Project) {
    const exists = saved.some(({ id }) => id === selection);
    if (!exists && saved.length >= 20) throw new Error("This browser has reached the 20-project limit. Export existing configurations to keep copies.");
    const id = exists ? selection : crypto.randomUUID();
    const next = exists ? saved.map((item) => item.id === id ? { id, project } : item) : [...saved, { id, project }];
    localStorage.setItem(storageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(change));
    setSelection(id);
    report("Configuration saved in this browser.");
  }
  function download(project: Project) {
    const href = URL.createObjectURL(new Blob([exportProject(project)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = (project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "invariant") + ".project.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    report("Project configuration exported.");
  }

  return <>
    <div className="iw-page-head"><p className="iw-kicker">LOCAL CONFIGURATION</p><h1>Projects</h1>
      <p>Configure a browser observation and a deterministic rule for a loopback application.</p></div>
    <div className="iw-inspector">
      <div className="iw-list" role="group" aria-label="Project list">
        {examples.map((project, index) => <button type="button" key={project.name} aria-pressed={selection === "example-" + index}
          onClick={() => choose("example-" + index, draftFrom(project))}>
          <span className="iw-kicker">{["BUILT-IN BENCHMARK", "DETERMINISTIC FIXTURE", "BROWSER VERIFIED"][index]}</span><strong>{project.name}</strong><span aria-hidden="true">→</span>
        </button>)}
        {saved.map(({ id, project }) => <button type="button" key={id} aria-pressed={selection === id} onClick={() => choose(id, draftFrom(project))}>
          <span className="iw-kicker">SAVED LOCALLY</span><strong>{project.name}</strong><span aria-hidden="true">→</span>
        </button>)}
        <div className="iw-actions">
          <button type="button" className="iw-button iw-primary" onClick={() => choose("draft", empty)}>New project</button>
          <input className="iw-file" type="file" id={importId} accept=".json,application/json" onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            try {
              if (file.size > 65536) throw new Error("JSON exceeds the 64 KiB limit.");
              choose("draft", draftFrom(importProject(await file.text())));
              report("Configuration imported. Save it to keep it in this browser.");
            } catch (error) { setFeedback({ error: true, text: error instanceof Error ? error.message : "Import failed." }); }
          }} />
          <label className="iw-button iw-secondary" htmlFor={importId}>Import JSON</label>
        </div>
      </div>
      <section className="iw-panel">
        <div className="iw-panel-head"><div><p className="iw-kicker">SCHEMA V1</p><h2>{isBuiltIn ? draft.name : selection === "draft" ? "Project draft" : "Edit project"}</h2></div>
          {isBuiltIn && <button type="button" className="iw-button iw-secondary" onClick={() =>
            choose("draft", { ...draft, name: draft.name + " copy" })}>Create a copy</button>}</div>
        {isBuiltIn && <p className="iw-muted">{descriptions[Number(selection.slice("example-".length))]}</p>}
        <form className="iw-project-form" onSubmit={(event) => { event.preventDefault(); action(save); }}>
          <fieldset disabled={isBuiltIn}>
            <label>Project name<input value={draft.name} maxLength={80} onChange={(event) => update("name", event.target.value)} required /></label>
            <label>Description<textarea value={draft.description} maxLength={400} onChange={(event) => update("description", event.target.value)} required /></label>
            <label>Application URL<input value={draft.url} maxLength={350} onChange={(event) => update("url", event.target.value)} placeholder="http://127.0.0.1:3000/" required /></label>
            <label>Kane observation objective<textarea rows={5} value={draft.objective} maxLength={2400} onChange={(event) => update("objective", event.target.value)} required /></label>
            <label>Required observations <small>Comma-separated names</small><input value={draft.observations} onChange={(event) => update("observations", event.target.value)} required /></label>
            <div className="iw-two">
              <label>Contract type<select value={draft.operator} onChange={(event) => update("operator", event.target.value)}><option value="equality">Equality</option><option value="conservation">Conservation</option></select></label>
              <label>Value format<select value={draft.format} onChange={(event) => update("format", event.target.value)}><option value="integer">Integer</option><option value="usd">USD display</option></select></label>
              <label>Left side<input value={draft.left} onChange={(event) => update("left", event.target.value)} required /></label>
              <label>Right side<input value={draft.right} onChange={(event) => update("right", event.target.value)} required /></label>
            </div>
          </fieldset>
          <div className="iw-actions">
            {!isBuiltIn && <button className="iw-button iw-primary" type="submit">Save project</button>}
            <button className="iw-button iw-secondary" type="button" onClick={() => action(() => report("Configuration is valid."))}>Validate configuration</button>
            <button className="iw-button iw-secondary" type="button" onClick={() => action(download)}>Export project ↓</button>
          </div>
        </form>
        {feedback && <p className={feedback.error ? "iw-note" : "iw-project-feedback"} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
      </section>
    </div>
    <section className="iw-panel iw-after"><h2>Verify from PowerShell</h2>
      <p>Export a configuration and review its objective before authorizing one bounded Kane run. Autonomous repair is scoped to the built-in LedgerLab benchmark.</p>
      <pre className="iw-code"><code>npm.cmd run project -- validate my-project.json{"\n"}npm.cmd run project -- run my-project.json --authorize-kane</code></pre>
    </section>
  </>;
}
