// Prediction ledger (JSON on disk; best-effort on read-only hosts). Every displayed best-side is logged
// with the market at that moment, then settled against real results and the closing line.
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { GamePrediction, LoggedPrediction, MarketLines } from "@/types";
import { fairTwoWay } from "./odds";

const FILE = process.env.VERCEL ? path.join(os.tmpdir(), "edgeline-predictions.json") : path.join(process.cwd(), "data", "predictions.json");
let writing: Promise<void> = Promise.resolve();

export async function readLedger(): Promise<LoggedPrediction[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as LoggedPrediction[];
  } catch {
    return [];
  }
}

async function writeLedger(rows: LoggedPrediction[]) {
  writing = writing.then(async () => {
    try {
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      await fs.writeFile(FILE, JSON.stringify(rows));
    } catch {
      /* read-only filesystem: skip */
    }
  });
  return writing;
}

export async function logPredictions(preds: GamePrediction[]) {
  if (!preds.length) return;
  const rows = await readLedger();
  const idx = new Map(rows.map((r) => [r.id, r]));
  let changed = false;
  for (const p of preds) {
    if (!p.market) continue;
    for (const m of p.predictions) {
      if (!m.best) continue;
      const id = `${p.sport}:${p.id}:${m.market}`;
      if (idx.has(id)) continue;
      rows.push({
        id, sport: p.sport, eventId: p.id, gameLabel: `${p.away.abbr} @ ${p.home.abbr}`, date: p.date,
        market: m.market, side: m.best.side, line: m.line, price: m.best.price,
        modelProb: m.best.modelProb, marketProb: m.best.marketProb, createdAt: new Date().toISOString(),
      });
      changed = true;
    }
  }
  if (changed) await writeLedger(rows);
}

function gradeSide(row: LoggedPrediction, p: GamePrediction): "win" | "loss" | "push" | undefined {
  if (p.homeScore === undefined || p.awayScore === undefined) return undefined;
  const margin = p.homeScore - p.awayScore;
  const total = p.homeScore + p.awayScore;
  const isHome = row.side.startsWith(p.home.abbr);
  if (row.market === "moneyline") {
    if (margin === 0) return "push";
    return (margin > 0) === isHome ? "win" : "loss";
  }
  if (row.market === "spread" && row.line !== undefined) {
    const adj = isHome ? margin + row.line : -margin - row.line;
    return adj > 0 ? "win" : adj < 0 ? "loss" : "push";
  }
  if (row.market === "total" && row.line !== undefined) {
    const over = row.side.startsWith("Over");
    if (total === row.line) return "push";
    return (total > row.line) === over ? "win" : "loss";
  }
  return undefined;
}

export async function settleFromGames(finals: GamePrediction[], odds: (MarketLines | undefined)[]) {
  if (!finals.length) return;
  const rows = await readLedger();
  let changed = false;
  for (const p of finals) {
    const o = odds.find((x) => x === p.market) || p.market;
    for (const row of rows) {
      if (row.eventId !== p.id || row.sport !== p.sport || row.result) continue;
      const r = gradeSide(row, p);
      if (!r) continue;
      row.result = r;
      row.settledAt = new Date().toISOString();
      if (row.market === "moneyline" && o?.closeHomeML !== undefined && o.closeAwayML !== undefined) {
        const [pH] = fairTwoWay(o.closeHomeML, o.closeAwayML);
        const isHome = row.side.startsWith(p.home.abbr);
        row.closingProb = isHome ? pH : 1 - pH;
        row.closingPrice = isHome ? o.closeHomeML : o.closeAwayML;
        row.clv = row.closingProb - row.marketProb;
      }
      changed = true;
    }
  }
  if (changed) await writeLedger(rows);
}

export function summarise(rows: LoggedPrediction[]) {
  const settled = rows.filter((r) => r.result && r.result !== "push");
  const wins = settled.filter((r) => r.result === "win").length;
  const profit = settled.reduce((acc, r) => acc + (r.result === "win" ? (r.price > 0 ? r.price / 100 : 100 / Math.abs(r.price)) : -1), 0);
  const brier = settled.length ? settled.reduce((a, r) => a + (r.modelProb - (r.result === "win" ? 1 : 0)) ** 2, 0) / settled.length : null;
  const clvRows = settled.filter((r) => r.clv !== undefined);
  return {
    logged: rows.length,
    pending: rows.filter((r) => !r.result).length,
    settled: settled.length,
    wins,
    hitRate: settled.length ? wins / settled.length : null,
    roi: settled.length ? profit / settled.length : null,
    brier,
    clvAvg: clvRows.length ? clvRows.reduce((a, r) => a + (r.clv ?? 0), 0) / clvRows.length : null,
    clvN: clvRows.length,
  };
}
