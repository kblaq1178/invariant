import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";

const mode = process.argv[2];
assert.ok(mode === "local" || mode === "public-only", "Usage: node scripts/smoke-workspace.mjs local|public-only");
const port = Number(process.env.INVARIANT_SMOKE_PORT ?? 3180);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const base = "http://127.0.0.1:" + port;
const edge = process.env.INVARIANT_EDGE ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const root = resolve(".invariant/browser-smoke");
await mkdir(root, { recursive: true });
const profile = await mkdtemp(join(root, mode + "-"));
const downloads = join(profile, "downloads");
await mkdir(downloads);
const output = (path) => join(profile, path);
const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1",
  "--port", String(port)], { windowsHide: true, stdio: "ignore" });
const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--disable-background-networking",
  "--disable-component-update", "--disable-extensions", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"], { windowsHide: true, stdio: "ignore" });
let launchError;
browser.on("error", (error) => { launchError = error; });
server.on("error", (error) => { launchError = error; });
let client;

async function until(condition, label, timeoutMs = 12_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (launchError) throw launchError;
    try {
      const result = await condition();
      if (result) return result;
    } catch (error) {
      if (browser.exitCode !== null) throw error;
    }
    await pause(130);
  }
  throw new Error("Timed out waiting for " + label);
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const pending = new Map();
  let id = 0;
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timeout);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const token = ++id;
    const timeout = setTimeout(() => {
      pending.delete(token);
      reject(new Error("DevTools command timed out: " + method));
    }, 6000);
    pending.set(token, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id: token, method, params }));
  });
  return { send, close: () => socket.close() };
}

try {
  await until(async () => (await fetch(base + "/demo", { signal: AbortSignal.timeout(2500) })).ok, "production server");
  assert.equal(server.exitCode, null);
  const endpoint = await until(async () => (await readFile(output("DevToolsActivePort"), "utf8")).split(/\r?\n/)[0], "Edge");
  const targets = await fetch("http://127.0.0.1:" + endpoint + "/json/list", { signal: AbortSignal.timeout(5000) }).then((response) => response.json());
  client = await connect(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  const { send } = client;
  await send("Page.bringToFront");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });

  async function js(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error("Browser smoke expression failed.");
    return result.result.value;
  }
  const quoted = JSON.stringify;
  const pageIncludes = (content) => js("document.body?.innerText.includes(" + quoted(content) + ")");
  async function open(path, heading) {
    await send("Page.navigate", { url: base + path });
    await until(() => pageIncludes(heading), heading);
  }
  async function button(label, result) {
    await until(async () => {
      if (await pageIncludes(result)) return true;
      await js("Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().startsWith(" + quoted(label) + "))?.click()");
      await pause(200);
      return pageIncludes(result);
    }, label);
  }
  async function choose(label, value, expected) {
    await until(async () => {
      await js("(() => { const select = Array.from(document.querySelectorAll('label')).find(x => x.innerText.startsWith(" +
        quoted(label) + "))?.querySelector('select'); if(select){ select.value = " + quoted(value) +
        ";select.dispatchEvent(new Event('change', {bubbles:true}));} })()");
      return pageIncludes(expected);
    }, expected);
  }
  async function screenshot(name) {
    const image = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(output(name), Buffer.from(image.data, "base64"));
  }
  const path = mode === "local" ? "/workspace" : "/demo";
  const homepage = await fetch(base + "/", { redirect: "manual", signal: AbortSignal.timeout(5000) });
  if (mode === "public-only") {
    assert.equal(homepage.status, 307);
    assert.equal(homepage.headers.get("location"), "/demo");
    await open("/", "Correctness");
    assert.equal(await js("location.pathname"), "/demo");
    for (const route of ["/workspace", "/workspace/evidence"]) {
      const response = await fetch(base + route, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), route.replace("/workspace", "/demo"));
    }
    for (const route of ["/demo/projects", "/workspace/projects"]) {
      assert.equal((await fetch(base + route, { signal: AbortSignal.timeout(5000) })).status, 404);
    }
  } else {
    assert.equal(homepage.status, 200);
    await open("/", "Alice balance");
    assert.equal(await js("document.querySelector('h1')?.textContent"), "LedgerLab");
  }
  for (const route of ["/api/repair", "/api/verify", "/api/executions", "/demo/api/repair", "/workspace/api/repair"]) {
    const response = await fetch(base + route, { method: "POST", headers: { "content-type": "application/json" },
      body: "{}", signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 404, route);
  }

  await open(path, "Correctness");
  await until(() => pageIncludes("The test passed."), "benchmark story");
  assert.equal(await pageIncludes("+$100.00"), true);
  await screenshot("desktop.png");
  await button("After repair", "$900.00");
  assert.equal(await pageIncludes("SATISFIED"), true);
  assert.equal(await js("(() => { const button = Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Seeded defect'); button.focus(); return document.activeElement === button; })()"), true);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " ", unmodifiedText: " " });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await until(() => js("Array.from(document.querySelectorAll('.iw-switch button')).find(b=>b.textContent.trim()==='Seeded defect').getAttribute('aria-pressed')==='true'"), "keyboard outcome selection");
  if (mode === "local") {
    await button("Run verification", "Run with the CLI");
    assert.equal(await js("document.querySelector('dialog')?.open"), true);
    await js("document.querySelector('dialog').close()");
  } else {
    assert.equal(await pageIncludes("Read-only evidence"), true);
    assert.equal(await pageIncludes("Run verification"), false);
    assert.equal(await pageIncludes("Start guided replay"), true);
    assert.equal(await pageIncludes("Conservation scenarios"), true);
    assert.equal(await js("!document.querySelector('nav a[href$=\"/projects\"]')"), true);
  }

  await open(path + "/contracts", "Business rules");
  await button("INV-002", "Unit tested");
  assert.equal(await pageIncludes("Kane retry workflow has yet to verify"), true);
  await button("INV-003", "scaffolded");
  await open(path + "/executions", "Historical replay");
  await button("Next event", "Replay event 2 of");
  assert.equal(await pageIncludes("Kane runs the transfer"), true);
  await button("Resume replay", "Replay event 3 of");
  assert.equal(await pageIncludes("Named observations enter INV-001"), true);
  await until(async () => {
    await js("Array.from(document.querySelectorAll('.iw-timeline button')).find(b=>b.textContent.includes('Violation detected')).click()");
    return pageIncludes("The observed total increased");
  }, "stage-specific violation");
  assert.equal(await pageIncludes("Conservation scenarios"), true);
  for (const amount of ["$10.00", "$100.00", "$250.00"]) assert.equal(await pageIncludes(amount), true);
  await open(path + "/repairs", "Actual source diff");
  assert.equal(await pageIncludes("ledger.balances[sender] - cents"), true);
  assert.equal(await js("new Set(Array.from(document.querySelectorAll('.iw-diff-line'), el=>el.getBoundingClientRect().top)).size > 10"), true);
  assert.equal(await pageIncludes("Copy diff"), true);
  await choose("Historical execution", "1", "name collision");
  await open(path + "/evidence", "Inspect the record");
  await choose("Browser execution", "1", "$900.00");
  assert.equal(await pageIncludes("cf6aa289-1172-4684-b7ef-08054df38aa4"), true);
  if (mode === "local") {
    const { root: dom } = await send("DOM.getDocument");
    const { nodeId } = await send("DOM.querySelector", { nodeId: dom.nodeId, selector: "input[type=file]" });
    const corrupt = output("invalid-receipt.json");
    await writeFile(corrupt, "invalid JSON");
    await send("DOM.setFileInputFiles", { nodeId, files: [corrupt] });
    await until(() => pageIncludes("not valid JSON"), "invalid receipt message");
    await send("DOM.setFileInputFiles", { nodeId, files: [resolve("docs/evidence/phase-2-closed-loop.json")] });
    await until(() => pageIncludes("already in the workspace"), "receipt ingestion");
    // Test the untrusted-import UI with a synthetic import envelope. The
    // genuine benchmark archive is read only and remains untouched.
    const sample = JSON.parse(await readFile("docs/evidence/phase-2-closed-loop.json", "utf8"));
    sample.runId = "12345678-1234-1234-1234-123456789abc";
    for (const event of sample.events) event.runId = sample.runId;
    sample.privateStream = "Projection must discard this field";
    const simulated = output("synthetic-import.json");
    await writeFile(simulated, JSON.stringify(sample));
    await send("DOM.setFileInputFiles", { nodeId, files: [simulated] });
    await until(() => pageIncludes("Imported evidence has not been independently authenticated"), "new receipt ingestion");
    assert.equal(await pageIncludes("IMPORTED"), true);
    assert.equal(await pageIncludes("Projection must discard this field"), false);
    assert.equal(await js("!Array.from(document.querySelectorAll('.iw-tools button')).some(b=>b.textContent.startsWith('Export diff'))"), true);
    await choose("Historical execution", "0", "VERIFIED");
  } else assert.equal(await js("!!document.querySelector('input[type=file]')"), false);
  for (const [label, extension] of [["Export JSON", ".json"], ["Export diff", ".diff"]]) {
    await js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith(" + quoted(label) + ")).click()");
    const path = await until(async () => (await readdir(downloads)).find((name) => name.endsWith(extension)), label);
    const data = await readFile(join(downloads, path), "utf8");
    if (extension === ".json") assert.equal(JSON.parse(data).finalStatus, "VERIFIED");
    else assert.match(data, /\[sender\]: ledger\.balances\[sender\] - cents/);
  }
  await button("Warehouse inventory", "Warehouse stock conservation");
  for (const content of ["350 / 390 units", "350 / 350 units", "VIOLATED", "SATISFIED"]) assert.equal(await pageIncludes(content), true);
  await choose("Inventory case", "1", "740095f9-a74f-4bea-8c0b-63f353578d0e");
  await js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('Export inventory JSON')).click()");
  const receiptName = "invariant-740095f9-a74f-4bea-8c0b-63f353578d0e.json";
  await until(async () => (await readdir(downloads)).includes(receiptName), "inventory receipt export");
  assert.equal(JSON.parse(await readFile(join(downloads, receiptName), "utf8")).verdict.status, "SATISFIED");
  if (mode === "local") {
    await open(path + "/projects", "Configure a browser observation");
    await until(() => pageIncludes("Warehouse inventory"), "non-ledger example");
    await button("DETERMINISTIC FIXTURE", "Browser evidence has not been recorded");
    await button("Create a copy", "Project draft");
    async function replaceUrl(url) {
      await js("(() => { const input=Array.from(document.querySelectorAll('label')).find(x=>x.innerText==='Application URL').querySelector('input');" +
        "Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input," + quoted(url) + ");" +
        "input.dispatchEvent(new Event('input',{bubbles:true})); })()");
    }
    await replaceUrl("https://example.com/inventory");
    await button("Validate configuration", "Use a loopback HTTP(S) URL");
    await replaceUrl("http://127.0.0.1:4173/inventory");
    await button("Save project", "Configuration saved in this browser");
    await button("Export project", "Project configuration exported");
    const artifact = await until(async () => (await readdir(downloads)).find((name) => name.endsWith(".project.json")), "project export");
    const configured = JSON.parse(await readFile(join(downloads, artifact), "utf8"));
    assert.equal(configured.name, "Warehouse inventory copy");
    assert.equal(configured.schemaVersion, 1);
    await send("Page.reload");
    await until(() => pageIncludes("SAVED LOCALLY"), "persisted project");
    const { root: dom } = await send("DOM.getDocument");
    const { nodeId } = await send("DOM.querySelector", { nodeId: dom.nodeId, selector: "input[type=file]" });
    await send("DOM.setFileInputFiles", { nodeId, files: [resolve("examples/inventory.project.json")] });
    await until(() => pageIncludes("Configuration imported"), "project import");
  }
  await open(path + "/sandbox", "Explore the ledger");
  assert.equal(await js("document.querySelector('iframe')?.getAttribute('src')"), "/ledgerlab");
  assert.equal(await js("!!document.querySelector('main a[href=\"/ledgerlab\"]')"), true);
  await until(() => js("document.querySelector('iframe')?.contentDocument?.body?.innerText.includes('Alice balance')"), "embedded LedgerLab");
  await open("/ledgerlab", "Alice balance");
  await until(async () => {
    if (await pageIncludes("Transfer completed.")) return true;
    await js("(() => { const form=document.querySelector('form'); form.querySelector('[name=amount]').value='100'; form.requestSubmit(); })()");
    await pause(180);
    return pageIncludes("Transfer completed.");
  }, "canonical LedgerLab transfer");
  assert.deepEqual(await js("Array.from(document.querySelectorAll('output.balance'),o=>o.textContent)"), ["$900.00", "$600.00"]);
  await button("Reset demo state", "Demo state reset.");
  assert.deepEqual(await js("Array.from(document.querySelectorAll('output.balance'),o=>o.textContent)"), ["$1,000.00", "$500.00"]);
  await open("/fixtures/conservation", "Seeded defect fixture");
  assert.deepEqual(await js("Array.from(document.querySelectorAll('footer a'),a=>a).filter(a=>a.textContent==='Corrected ledger' && a.getClientRects().length).map(a=>a.getAttribute('href'))"), ["/ledgerlab"]);
  await open("/inventory/seeded", "Seeded inventory discrepancy");
  await until(async () => {
    await js("(() => { const form=document.querySelector('form'); form.querySelector('[name=quantity]').value='40'; form.requestSubmit(); })()");
    return pageIncludes("Transfer complete");
  }, "inventory transfer");
  assert.deepEqual(await js("Array.from(document.querySelectorAll('output'),o=>o.textContent)"), ["240", "150"]);
  await button("Reset stock", "Stock reset.");
  assert.deepEqual(await js("Array.from(document.querySelectorAll('output'),o=>o.textContent)"), ["240", "110"]);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await open(path, "Correctness");
  assert.equal(await js("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await screenshot("mobile.png");
  await open(path + "/evidence", "Inspect the record");
  await button("Warehouse inventory", "Warehouse stock conservation");
  assert.equal(await js("document.documentElement.scrollWidth <= window.innerWidth"), true);
  if (mode === "local") {
    await open(path + "/projects", "Configure a browser observation");
    assert.equal(await js("document.documentElement.scrollWidth <= window.innerWidth"), true);
  }
  console.log(mode + ": all Edge smoke checks passed. Artifacts: " + profile);
} finally {
  client?.close();
  await Promise.all([browser, server].map(async (child) => {
    if (!child.pid || child.exitCode !== null) return;
    const killer = spawn(join(process.env.SystemRoot ?? "C:/Windows", "System32", "taskkill.exe"),
      ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    await Promise.race([new Promise((resolve) => { killer.once("close", resolve); killer.once("error", resolve); }), pause(5000)]);
  }));
}
