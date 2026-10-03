// Odds conversions and market de-vigging (power method + Shin).
import { clamp } from "./math";

export function americanToDecimal(a: number): number {
  return a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
}

export function decimalToAmerican(d: number): number {
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}

export function americanToImplied(a: number): number {
  return a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100);
}

export function probToAmerican(p: number): number {
  p = clamp(p, 0.01, 0.99);
  return p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
}

export function formatAmerican(a: number): string {
  return a > 0 ? `+${a}` : `${a}`;
}

/** Power-method de-vig: find k such that sum(p_i^k) = 1. */
export function devigPower(implied: number[]): number[] {
  const valid = implied.every((p) => p > 0 && p < 1);
  if (!valid || implied.length < 2) return implied;
  let lo = 0.5, hi = 3;
  for (let i = 0; i < 60; i++) {
    const k = (lo + hi) / 2;
    const s = implied.reduce((acc, p) => acc + Math.pow(p, k), 0);
    if (s > 1) lo = k; else hi = k;
  }
  const k = (lo + hi) / 2;
  const out = implied.map((p) => Math.pow(p, k));
  const s = out.reduce((a, b) => a + b, 0);
  return out.map((p) => p / s);
}

/** Shin (1993) de-vig for two-way markets. */
export function devigShin(implied: [number, number]): [number, number] {
  const [a, b] = implied;
  const total = a + b;
  if (total <= 1) return [a / total, b / total];
  const z = ((total - 1) * (a * a + b * b - total)) / (total * (a * a + b * b - 1)) || 0;
  const zz = clamp(z, 0, 0.2);
  const f = (p: number) => (Math.sqrt(zz * zz + 4 * (1 - zz) * ((p * p) / total)) - zz) / (2 * (1 - zz));
  const p1 = f(a), p2 = f(b);
  const s = p1 + p2;
  return [p1 / s, p2 / s];
}

/** Fair two-way probabilities from American prices (average of power + Shin). */
export function fairTwoWay(americanA: number, americanB: number): [number, number] {
  const ia = americanToImplied(americanA);
  const ib = americanToImplied(americanB);
  const [pa] = devigPower([ia, ib]);
  const [sa] = devigShin([ia, ib]);
  const p = (pa + sa) / 2;
  return [p, 1 - p];
}

export function vigPct(americanA: number, americanB: number): number {
  return (americanToImplied(americanA) + americanToImplied(americanB) - 1) * 100;
}

export function expectedValue(p: number, american: number): number {
  const d = americanToDecimal(american);
  return p * (d - 1) - (1 - p);
}

export function kellyFraction(p: number, american: number): number {
  const b = americanToDecimal(american) - 1;
  const f = (p * b - (1 - p)) / b;
  return Math.max(0, f);
}
