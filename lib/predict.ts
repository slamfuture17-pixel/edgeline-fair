// Game-level ensemble: Elo + rest/form blended with de-vigged market prices.
// Team sports price ML/spread/total; soccer prices the 3-way market with a Poisson goal model;
// athlete sports (tennis, MMA) price the winner market only.
import { SPORTS, SportKey } from "./sports";
import { buildElo, eloWinProb, recentForm, restDays, leagueAvgPoints, gamesPlayed, EloState } from "./elo";
import { eventOdds, upcoming, ScoreboardGame } from "./espn";
import { buildAthleteElo, upcomingMatches, matchCounts, recentResults, rankings } from "./individual";
import { normCdf, normInv, clamp, poissonCdf, blendLogit } from "./math";
import { fairTwoWay, devigPower, americanToImplied, expectedValue, kellyFraction, vigPct, formatAmerican } from "./odds";
import { logPredictions, settleFromGames } from "./store";
import type { GamePrediction, MarketLines, MarketPrediction, SideEdge, Factor } from "@/types";

function side(label: string, modelProb: number, marketProb: number, price: number): SideEdge {
  return { side: label, modelProb, marketProb, price, edge: modelProb - marketProb, ev: expectedValue(modelProb, price), kelly: kellyFraction(modelProb, price) };
}

function pickBest(sides: SideEdge[]): SideEdge | undefined {
  return [...sides].sort((a, b) => b.ev - a.ev)[0];
}

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
/** 3-way outcome probabilities from independent Poisson goal rates. */
function poisson3way(lh: number, la: number) {
  const pm = (l: number, k: number) => Math.exp(-l) * Math.pow(l, k) / FACT[k];
  let home = 0, draw = 0, away = 0;
  for (let h = 0; h <= 10; h++) for (let a = 0; a <= 10; a++) {
    const p = pm(lh, h) * pm(la, a);
    if (h > a) home += p; else if (h === a) draw += p; else away += p;
  }
  const s = home + draw + away;
  return { home: home / s, draw: draw / s, away: away / s };
}

/** Poisson rate implied by a totals line and the fair over probability (bisection). */
function impliedLambda(line: number, pOver: number): number {
  let lo = 0.2, hi = 8;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (1 - poissonCdf(Math.floor(line), mid) < pOver) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function predictGame(state: EloState, g: ScoreboardGame, market?: MarketLines, extra?: { counts?: Record<string, number>; ranks?: Record<string, number> }): GamePrediction {
  const cfg = SPORTS[state.sport];
  const athlete = cfg.kind === "athlete";
  const rh = state.ratings[g.home.id] ?? 1500;
  const ra = state.ratings[g.away.id] ?? 1500;

  const restH = athlete ? null : restDays(state, g.home.id, g.date);
  const restA = athlete ? null : restDays(state, g.away.id, g.date);
  let restAdj = 0;
  const b2b = (d: number | null) => d !== null && d <= 1;
  if (state.sport === "nba" || state.sport === "wnba" || state.sport === "ncaab") restAdj = (b2b(restA) ? 1.3 : 0) - (b2b(restH) ? 1.3 : 0);
  if (state.sport === "nhl") restAdj = (b2b(restA) ? 0.2 : 0) - (b2b(restH) ? 0.2 : 0);
  if (state.sport === "nfl" || state.sport === "ncaaf") restAdj = ((restH ?? 7) >= 13 ? 1.0 : 0) - ((restA ?? 7) >= 13 ? 1.0 : 0);

  const eloDiff = rh + cfg.homeAdv - ra;
  const eloMargin = athlete ? 0 : eloDiff / cfg.eloPerPoint + restAdj;
  const eloProb = clamp(eloWinProb(eloDiff + restAdj * cfg.eloPerPoint), 0.02, 0.98);

  const fh = recentForm(state, g.home.id);
  const fa = recentForm(state, g.away.id);
  const lg = leagueAvgPoints(state);
  const shrink = (x: number, n: number) => (isFinite(x) ? (x * n + lg * 5) / (n + 5) : lg);
  const hPF = shrink(fh.pf, fh.n), hPA = shrink(fh.pa, fh.n), aPF = shrink(fa.pf, fa.n), aPA = shrink(fa.pa, fa.n);
  const modelTotal = (hPF + aPA) / 2 + (aPF + hPA) / 2;

  // Thin history (<3 rated games) -> lean almost entirely on the market.
  const played = gamesPlayed(state);
  const unrated = (played[g.home.id] ?? 0) < 3 || (played[g.away.id] ?? 0) < 3;
  const w = market ? (unrated ? Math.max(cfg.marketWeight, 0.95) : cfg.marketWeight) : 0;
  let marketFair: GamePrediction["marketFair"];
  let homeWinProb = eloProb, drawProb: number | undefined, awayWinProb = 1 - eloProb;
  let expectedMargin = eloMargin;
  let expectedTotal = modelTotal;
  const predictions: MarketPrediction[] = [];

  if (cfg.draws) {
    let mktLambda: number | undefined;
    if (market?.total !== undefined) {
      const [fairO] = fairTwoWay(market.overOdds ?? -110, market.underOdds ?? -110);
      mktLambda = impliedLambda(market.total, fairO);
    }
    const mTotal = mktLambda !== undefined ? w * mktLambda + (1 - w) * modelTotal : modelTotal;
    expectedTotal = mTotal;
    const lh = Math.max(0.15, (mTotal + eloMargin) / 2), la = Math.max(0.15, (mTotal - eloMargin) / 2);
    const p3 = poisson3way(lh, la);
    homeWinProb = p3.home; drawProb = p3.draw; awayWinProb = p3.away;
    if (market?.homeML !== undefined && market.awayML !== undefined && market.drawML !== undefined) {
      const imp = [americanToImplied(market.homeML), americanToImplied(market.drawML), americanToImplied(market.awayML)];
      const [fh3, fd3, fa3] = devigPower(imp);
      marketFair = { homeWinProb: fh3, drawProb: fd3, vig: (imp[0] + imp[1] + imp[2] - 1) * 100 };
      let bh = blendLogit(fh3, p3.home, w), bd = blendLogit(fd3, p3.draw, w), ba = blendLogit(fa3, p3.away, w);
      const s = bh + bd + ba; bh /= s; bd /= s; ba /= s;
      homeWinProb = bh; drawProb = bd; awayWinProb = ba;
      expectedMargin = w * (normInv(fh3 / (fh3 + fa3)) * cfg.marginSigma) + (1 - w) * eloMargin;
      predictions.push({ market: "moneyline", sides: [side(`${g.home.abbr} win`, bh, fh3, market.homeML), side("Draw", bd, fd3, market.drawML), side(`${g.away.abbr} win`, ba, fa3, market.awayML)] });
    } else {
      predictions.push({ market: "moneyline", sides: [side(`${g.home.abbr} win`, p3.home, 1 / 3, 200), side("Draw", p3.draw, 1 / 3, 200), side(`${g.away.abbr} win`, p3.away, 1 / 3, 200)] });
    }
    if (market?.total !== undefined) {
      const pOver = 1 - poissonCdf(Math.floor(market.total), lh + la);
      const oOdds = market.overOdds ?? -110, uOdds = market.underOdds ?? -110;
      const [fairO] = fairTwoWay(oOdds, uOdds);
      predictions.push({ market: "total", line: market.total, sides: [side(`Over ${market.total}`, pOver, fairO, oOdds), side(`Under ${market.total}`, 1 - pOver, 1 - fairO, uOdds)] });
    }
  } else {
    if (market?.homeML !== undefined && market.awayML !== undefined) {
      const [pH] = fairTwoWay(market.homeML, market.awayML);
      marketFair = { homeWinProb: pH, vig: vigPct(market.homeML, market.awayML) };
      homeWinProb = blendLogit(pH, eloProb, w);
      awayWinProb = 1 - homeWinProb;
      predictions.push({ market: "moneyline", sides: [side(`${g.home.abbr} ML`, homeWinProb, pH, market.homeML), side(`${g.away.abbr} ML`, awayWinProb, 1 - pH, market.awayML)] });
    }
    if (cfg.hasSpread && market?.spreadHome !== undefined) {
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
    if (cfg.hasTotal && market?.total !== undefined) {
      expectedTotal = w * market.total + (1 - w) * modelTotal;
      const pOver = 1 - normCdf((market.total - expectedTotal) / cfg.totalSigma);
      const oOdds = market.overOdds ?? -110, uOdds = market.underOdds ?? -110;
      const [fairO] = fairTwoWay(oOdds, uOdds);
      predictions.push({ market: "total", line: market.total, sides: [side(`Over ${market.total}`, pOver, fairO, oOdds), side(`Under ${market.total}`, 1 - pOver, 1 - fairO, uOdds)] });
    }
  }
  for (const p of predictions) p.best = pickBest(p.sides);

  const factors: Factor[] = [];
  const unit = cfg.draws ? "goals" : "pts";
  factors.push({
    label: athlete ? "Rating gap" : "Power rating gap",
    value: `${Math.round(rh)} vs ${Math.round(ra)}`,
    impact: athlete ? (rh - ra) / 100 : (rh - ra) / cfg.eloPerPoint,
    explanation: `${rh >= ra ? g.home.abbr : g.away.abbr} rates ${Math.abs(Math.round(rh - ra))} Elo higher${athlete ? "" : ` (~${Math.abs((rh - ra) / cfg.eloPerPoint).toFixed(cfg.draws ? 2 : 1)} ${unit})`}, built from ${state.history.length.toLocaleString()} walk-forward results.`,
  });
  if (!athlete) factors.push({ label: "Home advantage", value: `+${(cfg.homeAdv / cfg.eloPerPoint).toFixed(cfg.draws ? 2 : 1)} ${unit}`, impact: cfg.homeAdv / cfg.eloPerPoint, explanation: `League-calibrated home edge for ${cfg.name}.` });
  if (athlete && extra?.ranks) {
    const rkH = extra.ranks[g.home.id], rkA = extra.ranks[g.away.id];
    if (rkH || rkA) factors.push({ label: "World ranking", value: `#${rkH ?? "—"} vs #${rkA ?? "—"}`, impact: rkH && rkA ? Math.sign(rkA - rkH) : 0, explanation: "Official tour ranking (shown for context; the rating model is match-result based)." });
  }
  if (athlete) {
    const rr = (id: string) => recentResults(state, id);
    const nH = extra?.counts?.[g.home.id] ?? 0, nA = extra?.counts?.[g.away.id] ?? 0;
    factors.push({ label: "Recent results", value: `${g.home.abbr} ${rr(g.home.id) || "—"} · ${g.away.abbr} ${rr(g.away.id) || "—"}`, impact: 0, explanation: `Last 5 results. Rated matches in sample: ${nH} vs ${nA}.` });
  }
  if (restAdj !== 0) factors.push({ label: "Rest", value: `${g.home.abbr} ${restH ?? "?"}d · ${g.away.abbr} ${restA ?? "?"}d`, impact: restAdj, explanation: restAdj > 0 ? `${g.away.abbr} is on short rest.` : `${g.home.abbr} is on short rest.` });
  if (!athlete && fh.n && fa.n) factors.push({ label: "Recent form (last 10)", value: `${g.home.abbr} ${fh.pf.toFixed(1)}-${fh.pa.toFixed(1)} · ${g.away.abbr} ${fa.pf.toFixed(1)}-${fa.pa.toFixed(1)}`, impact: ((fh.pf - fh.pa) - (fa.pf - fa.pa)) / 4, explanation: `Scored-conceded per game over each side's last ${Math.min(fh.n, fa.n)} games (shrunk toward league average).` });
  if (cfg.draws) factors.push({ label: "Expected goals", value: `${((expectedTotal + expectedMargin) / 2).toFixed(2)} – ${((expectedTotal - expectedMargin) / 2).toFixed(2)}`, impact: expectedMargin, explanation: "Poisson goal rates behind the win/draw/win probabilities." });
  if (market?.openSpreadHome !== undefined && market.spreadHome !== undefined && market.openSpreadHome !== market.spreadHome) factors.push({ label: "Line movement", value: `${market.openSpreadHome > 0 ? "+" : ""}${market.openSpreadHome} → ${market.spreadHome > 0 ? "+" : ""}${market.spreadHome}`, impact: market.openSpreadHome - market.spreadHome, explanation: market.spreadHome < market.openSpreadHome ? `Money has moved toward ${g.home.abbr} since open.` : `Money has moved toward ${g.away.abbr} since open.` });
  if (marketFair) factors.push({ label: "Market (de-vigged)", value: `${g.home.abbr} ${(marketFair.homeWinProb * 100).toFixed(1)}%${marketFair.drawProb !== undefined ? ` · draw ${(marketFair.drawProb * 100).toFixed(1)}%` : ""}`, impact: 0, explanation: `${market?.provider} prices with ${marketFair.vig.toFixed(1)}% hold removed. Weighted ${Math.round(w * 100)}% in the blend because closing lines are highly efficient.` });
  if (!market && cfg.marketWeight === 0) factors.push({ label: "No market feed", value: "model only", impact: 0, explanation: "No bookmaker prices are available for this tour in our data source, so probabilities are pure model output and edges cannot be computed." });

  const best = predictions.map((p) => p.best && { ...p.best, market: p.market }).filter(Boolean).sort((a, b) => b!.ev - a!.ev)[0] as (SideEdge & { market: string }) | undefined;
  const depth = athlete ? Math.min(extra?.counts?.[g.home.id] ?? 0, extra?.counts?.[g.away.id] ?? 0) : Math.min(fh.n, fa.n);
  if (unrated) factors.push({ label: "Limited history", value: `${(played[g.home.id] ?? 0) < 3 ? g.home.abbr : g.away.abbr} <3 rated games`, impact: 0, explanation: "Too few results in our sample for this participant, so the market price carries 95% of the weight here." });
  const confidence: GamePrediction["confidence"] = !market || unrated ? "C" : depth >= (athlete ? 8 : 5) && (best?.edge ?? 0) > 0.03 ? "A" : depth >= 3 ? "B" : "C";

  return {
    id: g.id, sport: state.sport, league: cfg.label, kind: cfg.kind, date: g.date, status: g.status, statusDetail: g.statusDetail, seasonType: g.seasonType,
    eventName: athlete ? g.eventName : undefined, round: g.round,
    home: { ...g.home, rank: extra?.ranks?.[g.home.id] ?? g.home.rank }, away: { ...g.away, rank: extra?.ranks?.[g.away.id] ?? g.away.rank },
    homeScore: g.homeScore, awayScore: g.awayScore,
    elo: { home: rh, away: ra, homeWinProb: eloProb, expectedMargin: eloMargin },
    rest: { home: restH, away: restA },
    form: { homePF: hPF, homePA: hPA, awayPF: aPF, awayPA: aPA, games: depth },
    model: { homeWinProb, drawProb, awayWinProb, expectedMargin, expectedTotal, marginSigma: cfg.marginSigma, totalSigma: cfg.totalSigma, marketWeight: w },
    market, marketFair, predictions, topEdge: market ? best : undefined, confidence, factors, venue: g.venue, broadcast: g.broadcast,
    modelOnly: !market && cfg.marketWeight === 0,
  };
}

const slateCache = new Map<string, { exp: number; v: GamePrediction[] }>();

/** Upcoming slate with predictions + ledger bookkeeping. Cached 60s per league. */
export async function slate(sport: SportKey, days = 3): Promise<GamePrediction[]> {
  const key = `${sport}:${days}`;
  const c = slateCache.get(key);
  if (c && c.exp > Date.now()) return c.v;
  const cfg = SPORTS[sport];
  let preds: GamePrediction[];
  let odds: (MarketLines | undefined)[];
  if (cfg.kind === "athlete") {
    const [state, matches, ranks] = await Promise.all([buildAthleteElo(sport), upcomingMatches(sport, days), rankings(sport)]);
    const counts = matchCounts(state);
    odds = cfg.marketWeight > 0 ? await Promise.all(matches.map((m) => eventOdds(sport, m.eventId, m.status === "final", m.id).catch(() => undefined))) : matches.map(() => undefined);
    preds = matches.map((m, i) => predictGame(state, m, odds[i], { counts, ranks }));
  } else {
    const [state, games] = await Promise.all([buildElo(sport), upcoming(sport, days)]);
    const regular = games.filter((g) => g.seasonType !== 1 || sport === "nba");
    odds = await Promise.all(regular.map((g) => eventOdds(sport, g.id, g.status === "final").catch(() => undefined)));
    preds = regular.map((g, i) => predictGame(state, g, odds[i]));
  }
  void logPredictions(preds.filter((p) => p.status === "scheduled"));
  void settleFromGames(preds.filter((p) => p.status === "final"), odds);
  slateCache.set(key, { exp: Date.now() + 60_000, v: preds });
  return preds;
}

export async function gameById(sport: SportKey, id: string): Promise<GamePrediction | undefined> {
  const preds = await slate(sport, 7);
  return preds.find((p) => p.id === id);
}

export { formatAmerican };
