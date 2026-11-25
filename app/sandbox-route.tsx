import Link from "next/link";
import type { ComponentProps } from "react";
import LedgerLab from "./ledger-lab";

export default function SandboxRoute({ variant }: ComponentProps<typeof LedgerLab>) {
  // Supply canonical links outside the protected LedgerLab implementation.
  return <div className="[&>main>footer]:hidden">
    <LedgerLab key={variant} variant={variant} />
    <footer className="shell flex flex-wrap gap-x-5 gap-y-2">
      <Link href="/ledgerlab">Corrected ledger</Link>
      <Link href="/fixtures/conservation">Conservation fixture</Link>
      <Link href="/fixtures/idempotency">Idempotency fixture</Link>
    </footer>
  </div>;
}
