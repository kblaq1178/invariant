export function parseDollars(input: unknown, displayed = false): number {
  if (typeof input !== "string" || input.length > 32) throw new Error("Invalid monetary value.");
  const match = displayed
    ? /^(-?)\$(0|[1-9]\d{0,2}(?:,\d{3})*)\.(\d{2})$/.exec(input)
    : /^()(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(input);
  if (!match || match[0] !== input) throw new Error("Invalid monetary value.");
  const cents = BigInt(match[2].replaceAll(",", "")) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Monetary value exceeds the safe range.");
  return Number(match[1] === "-" ? -cents : cents);
}

export function dollars(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error("Invalid cents.");
  const absolute = BigInt(Math.abs(cents));
  return (cents < 0 ? "-$" : "$") + (absolute / 100n).toLocaleString("en-US") + "." + String(absolute % 100n).padStart(2, "0");
}
