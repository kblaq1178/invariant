const transferSteps = "Click Reset demo state. Store the displayed Alice balance as 'before_sender'. Store the displayed Bob balance as 'before_recipient'. " +
  "With Sender Alice and Recipient Bob, enter 100.00 in Amount (USD) and click Send transfer exactly once. " +
  "Confirm the page displays Transfer completed. " +
  "Store the displayed Alice balance as 'after_sender'. Store the displayed Bob balance as 'after_recipient'. Finish.";
const observationRules = " Store the displayed currency text exactly.";
export const objectives = {
  observe: {
    path: "/", maxSteps: 10, timeoutSeconds: 240, contractId: null,
    keys: ["initial_sender", "initial_recipient"],
    objective: "Store the displayed Alice balance as 'initial_sender'. Store the displayed Bob balance as 'initial_recipient'. Finish." + observationRules,
  },
  transfer: {
    path: "/", maxSteps: 18, timeoutSeconds: 240, contractId: "INV-001",
    keys: ["before_sender", "before_recipient", "after_sender", "after_recipient"],
    objective: transferSteps + observationRules,
  },
  "seeded-conservation": {
    path: "/fixtures/conservation", maxSteps: 18, timeoutSeconds: 240, contractId: "INV-001",
    keys: ["before_sender", "before_recipient", "after_sender", "after_recipient"],
    objective: transferSteps + observationRules,
  },
} as const;

export type ObjectiveName = keyof typeof objectives;
