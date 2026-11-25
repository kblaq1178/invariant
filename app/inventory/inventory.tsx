"use client";

import Link from "next/link";
import { useReducer, type FormEvent } from "react";
import { initialStock, transferStock } from "../../src/inventory/stock";

type State = { stock: ReturnType<typeof initialStock>; message: string; error: boolean };
const reset = (): State => ({ stock: initialStock(), message: "", error: false });

export function Inventory({ seeded = false }: { seeded?: boolean }) {
  const [state, dispatch] = useReducer((state: State, quantity: string | null): State => {
    if (quantity === null) return { ...reset(), message: "Stock reset." };
    try { return { stock: transferStock(state.stock, quantity, seeded),
      message: "Transfer complete. Moved " + quantity + " units from North to South.", error: false }; }
    catch (error) { return { ...state, error: true, message: error instanceof Error ? error.message : "Transfer could not complete." }; }
  }, undefined, reset);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch(String(new FormData(event.currentTarget).get("quantity") ?? ""));
  }
  return <>
    <header><div className="shell flex items-center justify-between gap-4"><Link className="brand" href="/demo">◈ INVARIANT</Link>
      <button type="button" className="secondary" onClick={() => dispatch(null)}>Reset stock</button></div></header>
    <main className="shell">
      <div className="intro"><p className="eyebrow">STOCK TRANSFER SANDBOX</p><h1>Warehouse inventory</h1>
        <p>Move stock between two warehouse locations.</p></div>
      {seeded && <p className="fixture">Seeded inventory discrepancy · Source debit omitted</p>}
      <section aria-labelledby="warehouse-balances"><h2 id="warehouse-balances">On-hand stock</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <article className="panel account"><h3 id="north-quantity">North warehouse quantity</h3>
            <output className="balance" aria-labelledby="north-quantity">{state.stock.north}</output></article>
          <article className="panel account"><h3 id="south-quantity">South warehouse quantity</h3>
            <output className="balance" aria-labelledby="south-quantity">{state.stock.south}</output></article>
        </div>
      </section>
      <section className="panel mt-4"><h2>North to South transfer</h2><form onSubmit={submit}>
        <label>Transfer quantity<input name="quantity" inputMode="numeric" placeholder="0" maxLength={16} required /></label>
        <button type="submit">Move stock</button>
      </form><p className={state.error ? "message error" : "message"} role="status">{state.message}</p></section>
      <footer className="flex flex-wrap gap-4"><Link href="/inventory">Corrected inventory</Link>
        <Link href="/inventory/seeded">Seeded inventory fixture</Link><Link href="/demo/evidence">Verification evidence</Link></footer>
    </main>
  </>;
}
