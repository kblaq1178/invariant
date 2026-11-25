import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "LedgerLab · Invariant", description: "A fictional transaction sandbox for business integrity verification." };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
