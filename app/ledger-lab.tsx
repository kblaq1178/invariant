"use client";

import Link from "next/link";
import { useReducer, type FormEvent } from "react";
import { corrected, initialLedger, names, type Account, type Ledger } from "../src/ledger/transactions";
import { conservationDefect } from "../src/ledger/fixtures/conservation";
import { idempotencyDefect } from "../src/ledger/fixtures/idempotency";
import { dollars, parseDollars } from "../src/ledger/money";

const implementations = { corrected, conservation: conservationDefect, idempotency: idempotencyDefect };
type Variant = keyof typeof implementations;
type State = { ledger: Ledger; message: string; error: boolean };
type Action = { type: "reset" } | { type: "retry"; id: string } |
  { type: "transfer"; sender: Account; recipient: Account; amount: FormDataEntryValue | null; id: string };
const blank = (): State => ({ ledger: initialLedger(), message: "", error: false });

export default function LedgerLab({ variant }: { variant: Variant }) {
  const logic = implementations[variant];
  const [state, dispatch] = useReducer((state: State, action: Action): State => {
    if (action.type === "reset") return { ...blank(), message: "Demo state reset." };
    try {
      if (action.type === "retry") {
        return { ledger: logic.retry(state.ledger, action.id), message: "Retry completed for transaction " + action.id + ".", error: false };
      }
      const { id, sender, recipient, amount } = action;
      const ledger = logic.transfer(state.ledger, { id, sender, recipient, cents: parseDollars(amount) });
      return { ledger, message: "Transfer completed. Transaction ID " + id + ".", error: false };
    } catch (error) {
      return { ...state, error: true, message: error instanceof Error ? error.message : "Transaction failed." };
    }
  }, undefined, blank);
  const { ledger } = state;

  function transfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    dispatch({ type: "transfer", id: crypto.randomUUID(), sender: form.get("sender") as Account,
      recipient: form.get("recipient") as Account, amount: form.get("amount") });
  }

  return <>
    <header><div className="shell flex items-center justify-between gap-4">
      <Link className="brand" href="/"><span aria-hidden="true">◈</span> INVARIANT</Link>
      <button type="button" className="secondary" onClick={() => dispatch({ type: "reset" })}>Reset demo state</button>
    </div></header>
    <main className="shell">
      <div className="intro">
        <p className="eyebrow">TRANSACTION SANDBOX</p>
        <h1>LedgerLab</h1>
        <p>A fictional ledger for testing how business rules hold across transactions.</p>
      </div>
      {variant !== "corrected" && <p className="fixture">Seeded defect fixture · {variant === "conservation" ? "Conservation" : "Idempotency"}</p>}
      <section aria-labelledby="accounts">
        <h2 id="accounts">Account balances</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["A", "B"] as const).map((account) => <article className="panel account" key={account}>
            <p className="eyebrow">ACCOUNT {account}</p>
            <h3 id={account + "-balance-label"}>{names[account]} balance</h3>
            <output aria-labelledby={account + "-balance-label"} className="balance">{dollars(ledger.balances[account])}</output>
          </article>)}
        </div>
      </section>
      <div className="workbench">
        <section className="panel" aria-labelledby="transfer-heading">
          <h2 id="transfer-heading">New transfer</h2>
          <form onSubmit={transfer}>
            <label>Sender<select name="sender" defaultValue="A"><option value="A">Alice</option><option value="B">Bob</option></select></label>
            <label>Recipient<select name="recipient" defaultValue="B"><option value="A">Alice</option><option value="B">Bob</option></select></label>
            <label>Amount (USD)<input name="amount" inputMode="decimal" placeholder="0.00" maxLength={20} required /></label>
            <button type="submit">Send transfer</button>
          </form>
          <p className={state.error ? "message error" : "message"} role="status">{state.message}</p>
        </section>
        <section className="panel" aria-labelledby="history-heading">
          <h2 id="history-heading">Transaction history</h2>
          <p>Successful transaction count <output aria-label="Successful transaction count">{ledger.history.length}</output></p>
          {ledger.history.length === 0 ? <p className="empty">No transactions yet.</p> : <ul className="history">
            {ledger.history.map(({ id, sender, recipient, cents }) => <li key={id}>
              <div className="entry"><strong>{names[sender]} → {names[recipient]}</strong><span>{dollars(cents)}</span></div>
              <p className="transaction-id">Transaction ID <code>{id}</code></p>
              <button className="secondary" type="button" aria-label={"Retry transaction " + id} onClick={() => dispatch({ type: "retry", id })}>Retry transaction</button>
            </li>)}
          </ul>}
        </section>
      </div>
      <footer className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/">Corrected ledger</Link>
        <Link href="/fixtures/conservation">Conservation fixture</Link>
        <Link href="/fixtures/idempotency">Idempotency fixture</Link>
      </footer>
    </main>
  </>;
}
