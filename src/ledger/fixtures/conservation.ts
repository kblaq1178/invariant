import { successfulTransaction, validateTransfer, type TransactionLogic } from "../transactions";

// Seeded defect: the recipient is credited and the sender debit is missing.
export const conservationDefect: TransactionLogic = {
  transfer(ledger, transaction) {
    if (ledger.history.some((entry) => entry.id === transaction.id)) throw new Error("Transaction identifier already used.");
    validateTransfer(ledger, transaction);
    const { recipient, cents } = transaction;
    return {
      balances: { ...ledger.balances, [recipient]: ledger.balances[recipient] + cents },
      history: [transaction, ...ledger.history],
    };
  },
  retry(ledger, id) {
    successfulTransaction(ledger, id);
    return ledger;
  },
};
