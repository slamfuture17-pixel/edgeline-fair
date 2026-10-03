import { americanToDecimal } from "./odds";

export function pct(p: number, digits = 0): string {
  return `${(p * 100).toFixed(digits)}%`;
}

export function signedPct(p: number, digits = 1): string {
  const v = p * 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function price(american: number, format: "american" | "decimal" = "american"): string {
  if (format === "decimal") return americanToDecimal(american).toFixed(2);
  return american > 0 ? `+${american}` : `${american}`;
}

export function spread(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function kickoff(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} ${time}`;
}

export function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
