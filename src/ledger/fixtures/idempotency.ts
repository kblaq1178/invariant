import { corrected, successfulTransaction, type TransactionLogic } from "../transactions";

// Seeded defect: retry posts a second successful transfer under a fresh ID.
export const idempotencyDefect: TransactionLogic = {
  transfer: corrected.transfer,
  retry(ledger, id) {
    const transaction = successfulTransaction(ledger, id);
    return corrected.transfer(ledger, { ...transaction, id: crypto.randomUUID() });
  },
};
