export const names = { A: "Alice", B: "Bob" } as const;
export type Account = keyof typeof names;
export type Transaction = { id: string; sender: Account; recipient: Account; cents: number };
export type Ledger = { balances: Record<Account, number>; history: Transaction[] };
export type TransactionLogic = {
  transfer: (ledger: Ledger, transaction: Transaction) => Ledger;
  retry: (ledger: Ledger, id: string) => Ledger;
};

export function initialLedger(): Ledger {
  return { balances: { A: 100_000, B: 50_000 }, history: [] };
}

export function validateTransfer(ledger: Ledger, transaction: Transaction) {
  const { id, sender, recipient, cents } = transaction;
  if (!id || !Object.hasOwn(names, sender) || !Object.hasOwn(names, recipient) ||
      sender === recipient || !Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error("Choose different accounts and enter a positive amount.");
  }
  if (ledger.balances[sender] < cents) throw new Error("Insufficient funds.");
  if (!Number.isSafeInteger(ledger.balances[recipient] + cents)) throw new Error("Balance exceeds the safe range.");
}

export function successfulTransaction(ledger: Ledger, id: string): Transaction {
  const transaction = ledger.history.find((entry) => entry.id === id);
  if (!transaction) throw new Error("Unknown transaction.");
  return transaction;
}

export const corrected: TransactionLogic = {
  transfer(ledger, transaction) {
    const previous = ledger.history.find((entry) => entry.id === transaction.id);
    if (previous) {
      if (previous.sender !== transaction.sender || previous.recipient !== transaction.recipient ||
          previous.cents !== transaction.cents) throw new Error("Transaction identifier already used.");
      return ledger;
    }
    validateTransfer(ledger, transaction);
    const { sender, recipient, cents } = transaction;
    return {
      balances: { ...ledger.balances, [sender]: ledger.balances[sender] - cents, [recipient]: ledger.balances[recipient] + cents },
      history: [transaction, ...ledger.history],
    };
  },
  retry(ledger, id) {
    successfulTransaction(ledger, id);
    return ledger;
  },
};
