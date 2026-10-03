import { runBacktest } from "../lib/backtest";
import { SPORT_KEYS, isSportKey } from "../lib/sports";

async function main() {
  const arg = process.argv[2];
  const sports = arg && isSportKey(arg) ? [arg] : SPORT_KEYS;
  const n = Number(process.argv[3] || 320);
  for (const s of sports) {
    const t0 = Date.now();
    const r = await runBacktest(s, n, (d, t) => { if (d % 80 === 0 || d === t) console.log(`  ${s}: odds ${d}/${t}`); });
    console.log(`${s.toUpperCase()} games=${r.games} withMarket=${r.gamesWithMarket}`);
    console.log(`  Elo    brier=${r.elo.brier.toFixed(4)} ll=${r.elo.logLoss.toFixed(4)} acc=${(r.elo.accuracy * 100).toFixed(1)}%`);
    if (r.market) console.log(`  Market brier=${r.market.brier.toFixed(4)} ll=${r.market.logLoss.toFixed(4)} acc=${(r.market.accuracy * 100).toFixed(1)}%`);
    if (r.blend) console.log(`  Blend  brier=${r.blend.brier.toFixed(4)} ll=${r.blend.logLoss.toFixed(4)} acc=${(r.blend.accuracy * 100).toFixed(1)}%`);
    console.log(`  edge bets:`, r.edgeBets.map((e) => `${e.threshold}: ${e.bets} bets roi=${(e.roi * 100).toFixed(1)}%`).join(" | "), `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
