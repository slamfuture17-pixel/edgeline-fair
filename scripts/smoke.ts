import { slate } from "../lib/predict";
import { propsForGame } from "../lib/props";
import { upcoming } from "../lib/espn";
import { isSportKey } from "../lib/sports";

async function main() {
  const sport = process.argv[2] && isSportKey(process.argv[2]) ? process.argv[2] : "nfl";
  const t0 = Date.now();
  const s = await slate(sport, 3);
  console.log(`${sport} slate: ${s.length} games in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const g of s.slice(0, 6)) {
    console.log(`${g.away.abbr} @ ${g.home.abbr} ${g.status} | elo ${(g.elo.homeWinProb * 100).toFixed(0)}% mkt ${g.marketFair ? (g.marketFair.homeWinProb * 100).toFixed(0) + "%" : "-"} model ${(g.model.homeWinProb * 100).toFixed(0)}% | top: ${g.topEdge?.side} edge ${((g.topEdge?.edge ?? 0) * 100).toFixed(1)}% conf ${g.confidence}`);
  }
  const games = await upcoming(sport, 3);
  const g = games.find((x) => x.status === "scheduled");
  if (g) {
    const props = await propsForGame(sport, g);
    console.log(`props for ${g.shortName}: ${props.length}`);
    for (const p of props.slice(0, 8)) console.log(`  ${p.athleteName} (${p.team} ${p.position}) ${p.label} ${p.line} -> ${p.pick} ${(Math.max(p.overProb, p.underProb) * 100).toFixed(0)}% proj ${p.projection.mean.toFixed(1)}±${p.projection.sd.toFixed(1)} n=${p.projection.n} ${p.confidence}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
