import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";

export const repairPath = "transactions.ts";
export const targetUrl = "http://127.0.0.1:3142/";

export async function seedSource(repository: string) {
  const shared = await readFile(join(repository, "src/ledger/transactions.ts"), "utf8");
  const fixture = await readFile(join(repository, "src/ledger/fixtures/conservation.ts"), "utf8");
  const end = shared.indexOf("export const corrected:");
  const start = fixture.indexOf("export const conservationDefect:");
  if (end < 0 || start < 0) throw new Error("The seeded transaction sources changed shape.");
  return shared.slice(0, end) + fixture.slice(start).replace("conservationDefect:", "transactions:");
}

const markup = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LedgerLab · Invariant</title>' +
  '<style>body{max-width:880px;margin:3rem auto;padding:0 1rem;font:16px system-ui;background:#10151a;color:#edf3f5} section,form{padding:1rem;margin:1rem 0;border:1px solid #53636e;border-radius:.5rem} output{font:700 1.8rem monospace} label{display:block;margin:.8rem 0} button,input,select{padding:.5rem}</style>' +
  '<header><p>INVARIANT · SEEDED REPAIR BENCHMARK</p><button id="reset">Reset demo state</button></header><main><h1>LedgerLab</h1>' +
  '<section><h2>Account balances</h2><h3>Alice balance</h3><output aria-label="Alice balance" id="alice"></output><h3>Bob balance</h3><output aria-label="Bob balance" id="bob"></output></section>' +
  '<form id="transfer"><h2>New transfer</h2><label>Sender <select name="sender"><option value="A" selected>Alice</option><option value="B">Bob</option></select></label>' +
  '<label>Recipient <select name="recipient"><option value="A">Alice</option><option value="B" selected>Bob</option></select></label>' +
  '<label>Amount (USD) <input name="amount" inputmode="decimal" required></label><button>Send transfer</button></form>' +
  '<p role="status" id="message"></p><section><h2>Transaction history</h2><p>Successful transaction count <output id="count"></output></p><ul id="history"></ul></section></main>' +
  '<script type="module" src="/interface.js"></script></html>';

const frontend = `import { initialLedger, names, transactions } from "/transactions.js";
import { dollars, parseDollars } from "/money.js";
const get = (id) => document.getElementById(id);
let ledger = initialLedger();
function render(message = "") {
  get("alice").textContent = dollars(ledger.balances.A);
  get("bob").textContent = dollars(ledger.balances.B);
  get("count").textContent = ledger.history.length;
  get("message").textContent = message;
  get("history").replaceChildren(...ledger.history.map((entry) => {
    const li = document.createElement("li");
    const retry = document.createElement("button");
    retry.textContent = "Retry transaction";
    retry.addEventListener("click", () => {
      try {
        ledger = transactions.retry(ledger, entry.id);
        render("Retry completed for transaction " + entry.id + ".");
      } catch (error) { render(error.message); }
    });
    li.append(names[entry.sender] + " → " + names[entry.recipient] + " " + dollars(entry.cents) + " · Transaction ID " + entry.id + " ", retry);
    return li;
  }));
}
get("reset").addEventListener("click", () => {
  ledger = initialLedger();
  get("transfer").reset();
  render("Demo state reset.");
});
get("transfer").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const data = new FormData(event.currentTarget);
    const id = crypto.randomUUID();
    ledger = transactions.transfer(ledger, { id, sender: data.get("sender"), recipient: data.get("recipient"), cents: parseDollars(data.get("amount")) });
    render("Transfer completed. Transaction ID " + id + ".");
  } catch (error) { render(error.message); }
});
render();
`;

export function compileSource(source: string, module = ts.ModuleKind.ES2022) {
  const generated = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module, strict: true },
    reportDiagnostics: true, fileName: repairPath,
  });
  if (generated.diagnostics?.some((item) => item.category === ts.DiagnosticCategory.Error)) throw new Error("Transaction compilation failed.");
  return generated.outputText;
}

export async function startTarget(moneySource: string, transactionSource: string) {
  let code = compileSource(transactionSource);
  const money = compileSource(moneySource);
  const files = new Map([
    ["/", ["text/html; charset=utf-8", markup]],
    ["/interface.js", ["text/javascript; charset=utf-8", frontend]],
    ["/money.js", ["text/javascript; charset=utf-8", money]],
  ]);
  const server = createServer((request, response) => {
    const route = request.url === "/transactions.js" ? ["text/javascript; charset=utf-8", code] : files.get(request.url ?? "");
    if (!route || request.method !== "GET") { response.writeHead(404).end(); return; }
    response.writeHead(200, {
      "Content-Type": route[0], "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'",
    }).end(route[1]);
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { server.close(); reject(new Error("Repair target startup timed out.")); }, 5_000);
    server.once("error", (error) => { clearTimeout(timer); reject(error); });
    const url = new URL(targetUrl);
    server.listen(Number(url.port), url.hostname, () => { clearTimeout(timer); resolve(); });
  });
  return {
    replace(source: string) { code = compileSource(source); },
    close() { server.close(); server.closeAllConnections(); },
  };
}
