// Pure math + probability helpers shared by all models.

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26, |err| < 1.5e-7). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/** Inverse normal CDF (Acklam). */
export function normInv(p: number): number {
  p = clamp(p, 1e-9, 1 - 1e-9);
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425;
  let q: number, r: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pl) {
    q = p - 0.5;
    r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/** Poisson CDF P(X <= k). */
export function poissonCdf(k: number, lambda: number): number {
  if (lambda <= 0) return 1;
  let term = Math.exp(-lambda);
  let sum = term;
  for (let i = 1; i <= Math.floor(k); i++) {
    term *= lambda / i;
    sum += term;
  }
  return clamp(sum, 0, 1);
}

/** Negative binomial CDF P(X <= k) parameterised by mean and dispersion r (r -> inf = Poisson). */
export function negBinCdf(k: number, mean: number, r: number): number {
  if (mean <= 0) return 1;
  if (!isFinite(r) || r > 1e6) return poissonCdf(k, mean);
  const p = r / (r + mean);
  let pmf = Math.pow(p, r);
  let sum = pmf;
  for (let i = 1; i <= Math.floor(k); i++) {
    pmf *= ((i - 1 + r) / i) * (1 - p);
    sum += pmf;
  }
  return clamp(sum, 0, 1);
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function weightedMean(xs: number[], ws: number[]): number {
  let s = 0, w = 0;
  for (let i = 0; i < xs.length; i++) { s += xs[i] * ws[i]; w += ws[i]; }
  return w ? s / w : 0;
}

export function weightedVar(xs: number[], ws: number[], mu: number): number {
  let s = 0, w = 0;
  for (let i = 0; i < xs.length; i++) { s += ws[i] * (xs[i] - mu) ** 2; w += ws[i]; }
  return w ? s / w : 0;
}

/** Box-Muller standard normal sample. */
export function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function brier(p: number, y: 0 | 1): number {
  return (p - y) ** 2;
}

export function logLoss(p: number, y: 0 | 1): number {
  const q = clamp(p, 1e-6, 1 - 1e-6);
  return -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
}
