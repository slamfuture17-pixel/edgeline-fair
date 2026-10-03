// Game-level ensemble: Elo + rest/form adjustments blended with de-vigged market prices.
import { SPORTS, SportKey } from "./sports";
import { buildElo, eloWinProb, recentForm, restDays, leagueAvgPoints, EloState } from "./elo";
import { eventOdds, upcoming, ScoreboardGame } from "./espn";
import { normCdf, normInv, clamp } from "./math";
import { fairTwoWay, expectedValue, kellyFraction, vigPct, formatAmerican } from "./odds";
import { logPredictions, settleFromGames } from "./store";
import type { GamePrediction, MarketLines, MarketPrediction, SideEdge, Factor } from "@/types";

/** How much we trust the market vs. our own model per sport (validated in backtest). */
const MARKET_WEIGHT: Record<SportKey, number> = { nfl: 0.7, nba: 0.72, mlb: 0.75, nhl: 0.75 };

function side(label: string, modelProb: number, marketProb: number, price: number): SideEdge {
  return { side: label, modelProb, marketProb, price, edge: modelProb - marketProb, ev: expectedValue(modelProb, price), kelly: kellyFraction(modelProb, price) };
}

function pickBest(sides: SideEdge[]): SideEdge | undefined {
  return [...sides].sort((a, b) => b.ev - a.ev)[0];
}

export function predictGame(state: EloState, g: ScoreboardGame, market?: MarketLines): GamePrediction {
  const cfg = SPORTS[state.sport];
  const rh = state.ratings[g.home.id] ?? 1500;
  const ra = state.ratings[g.away.id] ?? 1500;

  const restH = restDays(state, g.home.id, g.date);
  const restA = restDays(state, g.away.id, g.date);
  let restAdj = 0;
  const b2b = (d: number | null) => d !== null && d <= 1;
  if (state.sport === "nba") restAdj = (b2b(restA) ? 1.3 : 0) - (b2b(restH) ? 1.3 : 0);
  if (state.sport === "nhl") restAdj = (b2b(restA) ? 0.2 : 0) - (b2b(restH) ? 0.2 : 0);
  if (state.sport === "nfl") restAdj = ((restH ?? 7) >= 13 ? 1.0 : 0) - ((restA ?? 7) >= 13 ? 1.0 : 0);

  const eloDiff = rh + cfg.homeAdv - ra;
  const eloMargin = eloDiff / cfg.eloPerPoint + restAdj;
  const eloProb = clamp(eloWinProb(eloDiff + restAdj * cfg.eloPerPoint), 0.02, 0.98);

  const fh = recentForm(state, g.home.id);
  const fa = recentForm(state, g.away.id);
  const lg = leagueAvgPoints(state);
  const shrink = (x: number, n: number) => (isFinite(x) ? (x * n + lg * 5) / (n + 5) : lg);
  const hPF = shrink(fh.pf, fh.n), hPA = shrink(fh.pa, fh.n), aPF = shrink(fa.pf, fa.n), aPA = shrink(fa.pa, fa.n);
  const modelTotal = (hPF + aPA) / 2 + (aPF + hPA) / 2;

  let marketFair: GamePrediction["marketFair"];
  let homeWinProb = eloProb;
  let expectedMargin = eloMargin;
  let expectedTotal = modelTotal;
  const w = MARKET_WEIGHT[state.sport];
  const predictions: MarketPrediction[] = [];

  if (market?.homeML !== undefined && market.awayML !== undefined) {
    const [pH] = fairTwoWay(market.homeML, market.awayML);
    marketFair = { homeWinProb: pH, vig: vigPct(market.homeML, market.awayML) };
    homeWinProb = w * pH + (1 - w) * eloProb;
    predictions.push({ market: "moneyline", sides: [side(`${g.home.abbr} ML`, homeWinProb, pH, market.homeML), side(`${g.away.abbr} ML`, 1 - homeWinProb, 1 - pH, market.awayML)] });
  }
  if (market?.spreadHome !== undefined) {
    // MLB/NHL run/puck lines are fixed at 1.5, so back the expected margin out of the de-vigged moneyline there.
    const fixedLine = state.sport === "mlb" || state.sport === "nhl";
    const marketMargin = fixedLine && marketFair ? normInv(marketFair.homeWinProb) * cfg.marginSigma : -market.spreadHome;
    expectedMargin = w * marketMargin + (1 - w) * eloMargin;
    const s = market.spreadHome;
    const pHomeCover = 1 - normCdf((-s - expectedMargin) / cfg.marginSigma);
    const hOdds = market.spreadHomeOdds ?? -110, aOdds = market.spreadAwayOdds ?? -110;
    const [fairH] = fairTwoWay(hOdds, aOdds);
    predictions.push({ market: "spread", line: s, sides: [side(`${g.home.abbr} ${s > 0 ? "+" : ""}${s}`, pHomeCover, fairH, hOdds), side(`${g.away.abbr} ${-s > 0 ? "+" : ""}${-s}`, 1 - pHomeCover, 1 - fairH, aOdds)] });
  } else if (predictions.length === 0) {
    predictions.push({ market: "moneyline", sides: [side(`${g.home.abbr} ML`, eloProb, 0.5, 100), side(`${g.away.abbr} ML`, 1 - eloProb, 0.5, 100)] });
  }
  if (market?.total !== undefined) {
    expectedTotal = w * market.total + (1 - w) * modelTotal;
    const pOver = 1 - normCdf((market.total - expectedTotal) / cfg.totalSigma);
    const oOdds = market.overOdds ?? -110, uOdds = market.underOdds ?? -110;
    const [fairO] = fairTwoWay(oOdds, uOdds);
    predictions.push({ market: "total", line: market.total, sides: [side(`Over ${market.total}`, pOver, fairO, oOdds), side(`Under ${market.total}`, 1 - pOver, 1 - fairO, uOdds)] });
  }
  for (const p of predictions) p.best = pickBest(p.sides);

  const factors: Factor[] = [];
  factors.push({ label: "Power rating gap", value: `${Math.round(rh)} vs ${Math.round(ra)}`, impact: (rh - ra) / cfg.eloPerPoint, explanation: `${rh >= ra ? g.home.abbr : g.away.abbr} rates ${Math.abs(Math.round(rh - ra))} Elo higher (~${Math.abs((rh - ra) / cfg.eloPerPoint).toFixed(1)} pts), built from ${state.history.length.toLocaleString()} walk-forward results.` });
  factors.push({ label: "Home advantage", value: `+${(cfg.homeAdv / cfg.eloPerPoint).toFixed(1)} pts`, impact: cfg.homeAdv / cfg.eloPerPoint, explanation: `League-calibrated home edge for ${cfg.label}.` });
  if (restAdj !== 0) factors.push({ label: "Rest", value: `${g.home.abbr} ${restH ?? "?"}d · ${g.away.abbr} ${restA ?? "?"}d`, impact: restAdj, explanation: restAdj > 0 ? `${g.away.abbr} is on short rest.` : `${g.home.abbr} is on short rest.` });
  if (fh.n && fa.n) factors.push({ label: "Recent form (last 10)", value: `${g.home.abbr} ${fh.pf.toFixed(1)}-${fh.pa.toFixed(1)} · ${g.away.abbr} ${fa.pf.toFixed(1)}-${fa.pa.toFixed(1)}`, impact: ((fh.pf - fh.pa) - (fa.pf - fa.pa)) / 4, explanation: `Point differential per game over each team's last ${Math.min(fh.n, fa.n)} games (shrunk toward league average).` });
  if (market?.openSpreadHome !== undefined && market.spreadHome !== undefined && market.openSpreadHome !== market.spreadHome) factors.push({ label: "Line movement", value: `${market.openSpreadHome > 0 ? "+" : ""}${market.openSpreadHome} → ${market.spreadHome > 0 ? "+" : ""}${market.spreadHome}`, impact: market.openSpreadHome - market.spreadHome, explanation: market.spreadHome < market.openSpreadHome ? `Money has moved toward ${g.home.abbr} since open.` : `Money has moved toward ${g.away.abbr} since open.` });
  if (marketFair) factors.push({ label: "Market (de-vigged)", value: `${g.home.abbr} ${(marketFair.homeWinProb * 100).toFixed(1)}%`, impact: 0, explanation: `${market?.provider} prices with ${marketFair.vig.toFixed(1)}% hold removed (power + Shin). Weighted ${Math.round(w * 100)}% in the blend because closing lines are highly efficient.` });

  const best = predictions.map((p) => p.best && { ...p.best, market: p.market }).filter(Boolean).sort((a, b) => b!.ev - a!.ev)[0] as (SideEdge & { market: string }) | undefined;
  const depth = Math.min(fh.n, fa.n);
  const confidence: GamePrediction["confidence"] = !market ? "C" : depth >= 5 && (best?.edge ?? 0) > 0.03 ? "A" : depth >= 3 ? "B" : "C";

  return {
    id: g.id, sport: state.sport, date: g.date, status: g.status, statusDetail: g.statusDetail, seasonType: g.seasonType,
    home: g.home, away: g.away, homeScore: g.homeScore, awayScore: g.awayScore,
    elo: { home: rh, away: ra, homeWinProb: eloProb, expectedMargin: eloMargin },
    rest: { home: restH, away: restA },
    form: { homePF: hPF, homePA: hPA, awayPF: aPF, awayPA: aPA, games: depth },
    model: { homeWinProb, expectedMargin, expectedTotal, marginSigma: cfg.marginSigma, totalSigma: cfg.totalSigma, marketWeight: w },
    market, marketFair, predictions, topEdge: best, confidence, factors, venue: g.venue, broadcast: g.broadcast,
  };
}

export async function slate(sport: SportKey, days = 3): Promise<GamePrediction[]> {
  const [state, games] = await Promise.all([buildElo(sport), upcoming(sport, days)]);
  const regular = games.filter((g) => g.seasonType !== 1 || sport === "nba");
  const odds = await Promise.all(regular.map((g) => eventOdds(sport, g.id, g.status === "final").catch(() => undefined)));
  const preds = regular.map((g, i) => predictGame(state, g, odds[i]));
  void logPredictions(preds.filter((p) => p.status === "scheduled"));
  void settleFromGames(preds.filter((p) => p.status === "final"), odds);
  return preds;
}

export async function gameById(sport: SportKey, id: string): Promise<GamePrediction | undefined> {
  const preds = await slate(sport, 7);
  return preds.find((p) => p.id === id);
}

export { formatAmerican };
