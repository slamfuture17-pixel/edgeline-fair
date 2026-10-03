// Walk-forward backtest: Elo-only vs. de-vigged closing line vs. blend, on real finished games.
import { promises as fs } from "fs";
import path from "path";
import { SportKey, SPORTS } from "./sports";
import { buildElo } from "./elo";
import { buildAthleteElo } from "./individual";
import { eventOdds } from "./espn";
import { fairTwoWay, americanToDecimal } from "./odds";
import { brier, logLoss, blendLogit } from "./math";
import type { BacktestSummary } from "@/types";

function scores(rows: { p: number; y: 0 | 1 }[]) {
  if (!rows.length) return null;
  return {
    brier: rows.reduce((a, r) => a + brier(r.p, r.y), 0) / rows.length,
    logLoss: rows.reduce((a, r) => a + logLoss(r.p, r.y), 0) / rows.length,
    accuracy: rows.filter((r) => (r.p >= 0.5 ? 1 : 0) === r.y).length / rows.length,
  };
}

export async function runBacktest(sport: SportKey, maxMarketGames = 320, onProgress?: (done: number, total: number) => void): Promise<BacktestSummary> {
  const state = SPORTS[sport].kind === "athlete" ? await buildAthleteElo(sport) : await buildElo(sport);
  const finals = state.history.filter((g) => g.final && isFinite(g.homeScore) && isFinite(g.awayScore) && g.homeScore !== g.awayScore);
  const eloRows = finals.map((g) => ({ p: g.eloHomeProb, y: (g.homeScore > g.awayScore ? 1 : 0) as 0 | 1 }));

  // walk-forward games-played counts so thin-history games lean on the market exactly like the live model
  const seen: Record<string, number> = {};
  const thin = new Map<string, boolean>();
  for (const g of state.history) {
    thin.set(g.id, (seen[g.home.id] ?? 0) < 3 || (seen[g.away.id] ?? 0) < 3);
    seen[g.home.id] = (seen[g.home.id] ?? 0) + 1; seen[g.away.id] = (seen[g.away.id] ?? 0) + 1;
  }
  const sample = finals.slice(-maxMarketGames);
  const mkt: { elo: number; market: number; blend: number; y: 0 | 1; homeML: number; awayML: number }[] = [];
  const batch = 8;
  for (let i = 0; i < sample.length; i += batch) {
    const chunk = sample.slice(i, i + batch);
    const odds = await Promise.all(chunk.map((g) => eventOdds(sport, g.eventId ?? g.id, true, g.eventId ? g.id : undefined).catch(() => undefined)));
    chunk.forEach((g, j) => {
      const o = odds[j];
      const h = o?.closeHomeML ?? o?.homeML, a = o?.closeAwayML ?? o?.awayML;
      if (h === undefined || a === undefined) return;
      const [pH] = fairTwoWay(h, a);
      const w = thin.get(g.id) ? Math.max(SPORTS[sport].marketWeight, 0.95) : SPORTS[sport].marketWeight;
      mkt.push({ elo: g.eloHomeProb, market: pH, blend: blendLogit(pH, g.eloHomeProb, w), y: g.homeScore > g.awayScore ? 1 : 0, homeML: h, awayML: a });
    });
    onProgress?.(Math.min(i + batch, sample.length), sample.length);
  }

  const calSrc = mkt.length ? mkt.map((m) => ({ p: m.blend, y: m.y })) : eloRows;
  const buckets = [0, 0.4, 0.5, 0.6, 0.7, 0.8, 1.01];
  const calibration = [] as BacktestSummary["calibration"];
  for (let b = 0; b < buckets.length - 1; b++) {
    const rows = calSrc.filter((r) => r.p >= buckets[b] && r.p < buckets[b + 1]);
    if (!rows.length) continue;
    calibration.push({
      bucket: `${Math.round(buckets[b] * 100)}-${Math.round(Math.min(buckets[b + 1], 1) * 100)}%`,
      predicted: rows.reduce((a, r) => a + r.p, 0) / rows.length,
      actual: rows.reduce((a, r) => a + r.y, 0) / rows.length,
      n: rows.length,
    });
  }

  const edgeBets = [0.02, 0.04, 0.06].map((threshold) => {
    let bets = 0, wins = 0, pnl = 0, clv = 0;
    for (const m of mkt) {
      const sides = [
        { p: m.blend, q: m.market, price: m.homeML, win: m.y === 1 },
        { p: 1 - m.blend, q: 1 - m.market, price: m.awayML, win: m.y === 0 },
      ];
      for (const s of sides) {
        if (s.p - s.q < threshold) continue;
        bets++;
        clv += s.p - s.q;
        if (s.win) { wins++; pnl += americanToDecimal(s.price) - 1; } else pnl -= 1;
      }
    }
    return { threshold, bets, wins, roi: bets ? pnl / bets : 0, clvAvg: bets ? clv / bets : 0 };
  });

  const summary: BacktestSummary = {
    sport,
    seasons: [...new Set(finals.map((g) => g.season))],
    games: finals.length,
    gamesWithMarket: mkt.length,
    elo: scores(eloRows)!,
    market: scores(mkt.map((m) => ({ p: m.market, y: m.y }))),
    blend: scores(mkt.map((m) => ({ p: m.blend, y: m.y }))),
    calibration,
    edgeBets,
    generatedAt: new Date().toISOString(),
  };
  const file = path.join(process.cwd(), "data", `backtest-${sport}.json`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(summary, null, 2));
  return summary;
}

export async function readBacktest(sport: SportKey): Promise<BacktestSummary | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), "data", `backtest-${sport}.json`), "utf8"));
  } catch {
    return null;
  }
}
