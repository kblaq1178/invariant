import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { compileSource, repairPath } from "./target";

export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export async function inventory(directory: string) {
  const files = new Map<string, string>();
  async function walk(path: string, prefix = "") {
    for (const name of (await readdir(path)).sort()) {
      const absolute = join(path, name);
      const relative = prefix + name;
      const stat = await lstat(absolute);
      if (files.size >= 100 || stat.isSymbolicLink() ||
          (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && (stat.nlink !== 1 || stat.size > 100_000))) {
        throw new Error("Unsupported entry in repair workspace.");
      }
      if (stat.isDirectory()) {
        files.set(relative + "/", "directory");
        await walk(absolute, relative + "/");
      } else {
        files.set(relative, hash(await readFile(absolute)));
      }
    }
  }
  await walk(directory);
  return files;
}

export function validateInventory(before: Map<string, string>, after: Map<string, string>) {
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((key) => before.get(key) !== after.get(key));
  if (changed.some((path) => path !== repairPath) || !after.has(repairPath)) throw new Error("Unauthorized workspace change.");
  if (changed.length !== 1) throw new Error("Repair made no source change.");
  return changed;
}

function transferBody(source: string) {
  const ast = ts.createSourceFile(repairPath, source, ts.ScriptTarget.ES2022, true);
  const declaration = ast.statements.filter(ts.isVariableStatement).flatMap((item) => [...item.declarationList.declarations])
    .find((item) => item.name.getText(ast) === "transactions");
  const object = declaration?.initializer;
  if (!object || !ts.isObjectLiteralExpression(object)) throw new Error("The transaction API changed.");
  const method = object.properties.find((item): item is ts.MethodDeclaration =>
    ts.isMethodDeclaration(item) && item.name.getText(ast) === "transfer");
  if (!method?.body) throw new Error("Missing transaction transfer body.");
  return { body: method.body, outside: source.slice(0, method.body.getStart(ast)) + source.slice(method.body.end) };
}

const behaviorChecks = `
  const {initialLedger,transactions} = exports;
  for (const [sender,recipient,cents] of [["A","B",10000],["A","B",1000],["A","B",25000],["B","A",125]]) {
    const initial = initialLedger();
    const tx = {id:"check",sender,recipient,cents};
    const next = transactions.transfer(initial,tx);
    if (next.balances[sender] !== initial.balances[sender] - cents ||
        next.balances[recipient] !== initial.balances[recipient] + cents ||
        next.history.length !== 1 || next.history[0].id !== tx.id ||
        transactions.retry(next,tx.id) !== next || initial.history.length !== 0) throw Error("Transaction check failed.");
    for (const invalid of [tx,{...tx,id:"other",cents:200000},{...tx,id:"other",recipient:sender}]) {
      let rejected = false;
      try { transactions.transfer(next,invalid); } catch { rejected = true; }
      if (!rejected) throw Error("Transaction rejection behavior changed.");
    }
  }
`;

export function validateSource(original: string, candidate: string) {
  const body = transferBody(candidate);
  if (transferBody(original).outside !== body.outside) throw new Error("Only the transfer implementation body may change.");
  // Accept local ledger operations before importing candidate code.
  const kinds = new Set([
    ts.SyntaxKind.Block, ts.SyntaxKind.IfStatement, ts.SyntaxKind.ThrowStatement,
    ts.SyntaxKind.ReturnStatement, ts.SyntaxKind.ExpressionStatement, ts.SyntaxKind.VariableStatement,
    ts.SyntaxKind.VariableDeclarationList, ts.SyntaxKind.VariableDeclaration, ts.SyntaxKind.ObjectBindingPattern,
    ts.SyntaxKind.BindingElement, ts.SyntaxKind.Identifier, ts.SyntaxKind.CallExpression, ts.SyntaxKind.NewExpression,
    ts.SyntaxKind.ArrowFunction, ts.SyntaxKind.Parameter, ts.SyntaxKind.EqualsGreaterThanToken,
    ts.SyntaxKind.PropertyAccessExpression, ts.SyntaxKind.ElementAccessExpression, ts.SyntaxKind.BinaryExpression,
    ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.PlusToken,
    ts.SyntaxKind.MinusToken, ts.SyntaxKind.StringLiteral, ts.SyntaxKind.ObjectLiteralExpression,
    ts.SyntaxKind.ArrayLiteralExpression, ts.SyntaxKind.SpreadAssignment, ts.SyntaxKind.SpreadElement,
    ts.SyntaxKind.PropertyAssignment, ts.SyntaxKind.ComputedPropertyName, ts.SyntaxKind.ParenthesizedExpression,
  ]);
  const names = new Set(["ledger", "transaction", "validateTransfer", "Error"]);
  const fields = new Set(["history", "id", "balances", "sender", "recipient", "cents", "some"]);
  function review(node: ts.Node) {
    if (!kinds.has(node.kind)) throw new Error("Transfer contains unsupported operations.");
    if (ts.isBindingElement(node) || ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      if (ts.isIdentifier(node.name)) names.add(node.name.text);
    }
    if (ts.isIdentifier(node) && !names.has(node.text) && !fields.has(node.text)) {
      throw new Error("Transfer references an unsupported identifier.");
    }
    if (ts.isPropertyAccessExpression(node) && !fields.has(node.name.text)) throw new Error("Unsupported state field.");
    if (ts.isCallExpression(node) &&
        !["validateTransfer", "ledger.history.some"].includes(node.expression.getText())) throw new Error("Transfer calls an unsupported function.");
    if (ts.isNewExpression(node) && node.expression.getText() !== "Error") throw new Error("Transfer constructs an unsupported type.");
    if (ts.isElementAccessExpression(node) && !/^(sender|recipient)$/.test(node.argumentExpression.getText())) {
      throw new Error("Transfer uses unsupported computed state access.");
    }
    ts.forEachChild(node, review);
  }
  review(body.body);

  const code = compileSource(candidate, ts.ModuleKind.CommonJS);
  runInNewContext("const exports = {};\n" + code + "\n{\n" + behaviorChecks + "\n}",
    Object.create(null), { timeout: 500, contextCodeGeneration: { strings: false, wasm: false } });
}
