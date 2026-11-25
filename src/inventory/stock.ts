export type Stock = { north: number; south: number };
export const initialStock = (): Stock => ({ north: 240, south: 110 });

export function transferStock(stock: Stock, quantity: string, seeded: boolean): Stock {
  const amount = Number(quantity);
  if (!/^[1-9]\d*$/.test(quantity) || quantity.trim() !== quantity || !Number.isSafeInteger(amount) || amount > stock.north) {
    throw new Error("Enter a whole quantity within the available North stock.");
  }
  const south = stock.south + amount;
  if (!Number.isSafeInteger(south)) throw new Error("The destination quantity would exceed the safe range.");
  // The visibly marked fixture skips the source debit. Both paths record confirmation.
  return { north: seeded ? stock.north : stock.north - amount, south };
}
