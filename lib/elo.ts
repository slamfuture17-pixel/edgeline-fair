// Elo engine with margin-of-victory multiplier, home advantage, and season regression (walk-forward).
import { SPORTS, SportKey } from "./sports";
import { seasonGames } from "./espn";
import type { GameResult } from "@/types";

export interface EloGame extends GameResult {
  homeEloPre: number;
  awayEloPre: number;
  eloHomeProb: number;
}

export interface EloState {
  sport: SportKey;
  ratings: Record<string, number>;
  lastGame: Record<string, string>;
  recent: Record<string, { pf: number; pa: number; date: string }[]>;
  history: EloGame[];
  builtAt: string;
}

const BASE = 1500;

export function eloWinProb(diff: number): number {
  return 1 / (1 + Math.pow(10, -diff / 400));
}

function movMult(margin: number, eloDiffWinner: number): number {
  return Math.log(Math.abs(margin) + 1) * (2.2 / (eloDiffWinner * 0.001 + 2.2));
}

export function applyGame(state: EloState, g: GameResult): EloGame {
  const cfg = SPORTS[state.sport];
  const rh = state.ratings[g.home.id] ?? BASE;
  const ra = state.ratings[g.away.id] ?? BASE;
  const diff = rh + cfg.homeAdv - ra;
  const pHome = eloWinProb(diff);
  const out: EloGame = { ...g, homeEloPre: rh, awayEloPre: ra, eloHomeProb: pHome };
  if (!g.final || !isFinite(g.homeScore) || !isFinite(g.awayScore)) return out;
  const margin = g.homeScore - g.awayScore;
  const sHome = margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  let k = cfg.k;
  if (cfg.movMultiplier && margin !== 0) {
    const winnerDiff = margin > 0 ? diff : -diff;
    k *= movMult(margin, winnerDiff);
  }
  const delta = k * (sHome - pHome);
  state.ratings[g.home.id] = rh + delta;
  state.ratings[g.away.id] = ra - delta;
  state.lastGame[g.home.id] = g.date;
  state.lastGame[g.away.id] = g.date;
  const push = (id: string, pf: number, pa: number) => {
    const arr = (state.recent[id] ||= []);
    arr.push({ pf, pa, date: g.date });
    if (arr.length > 10) arr.shift();
  };
  push(g.home.id, g.homeScore, g.awayScore);
  push(g.away.id, g.awayScore, g.homeScore);
  return out;
}

function regressSeason(state: EloState, carry: number) {
  for (const id of Object.keys(state.ratings)) state.ratings[id] = BASE + (state.ratings[id] - BASE) * carry;
  state.recent = {};
}

const stateCache = new Map<string, { exp: number; state: EloState }>();
const inflight = new Map<string, Promise<EloState>>();

/** Build (or reuse) the Elo state across configured seasons, walk-forward. De-duplicates concurrent builds. */
export async function buildElo(sport: SportKey): Promise<EloState> {
  const c = stateCache.get(sport);
  if (c && c.exp > Date.now()) return c.state;
  const running = inflight.get(sport);
  if (running) return running;
  const p = (async () => {
    const cfg = SPORTS[sport];
    const state: EloState = { sport, ratings: {}, lastGame: {}, recent: {}, history: [], builtAt: new Date().toISOString() };
    let first = true;
    for (const season of cfg.seasons) {
      const games = await seasonGames(sport, season).catch(() => [] as GameResult[]);
      if (!games.length) continue;
      if (!first) regressSeason(state, cfg.carryover);
      first = false;
      for (const g of games) {
        if (!g.final) continue;
        state.history.push(applyGame(state, g));
      }
    }
    stateCache.set(sport, { exp: Date.now() + 15 * 60_000, state });
    return state;
  })();
  inflight.set(sport, p);
  try {
    return await p;
  } finally {
    inflight.delete(sport);
  }
}

export function restDays(state: EloState, teamId: string, gameDate: string): number | null {
  const last = state.lastGame[teamId];
  if (!last) return null;
  return Math.round((new Date(gameDate).getTime() - new Date(last).getTime()) / 86_400_000);
}

export function recentForm(state: EloState, teamId: string, n = 10) {
  const arr = (state.recent[teamId] || []).slice(-n);
  if (!arr.length) return { pf: NaN, pa: NaN, n: 0 };
  return {
    pf: arr.reduce((a, b) => a + b.pf, 0) / arr.length,
    pa: arr.reduce((a, b) => a + b.pa, 0) / arr.length,
    n: arr.length,
  };
}

export function leagueAvgPoints(state: EloState): number {
  const h = state.history.slice(-400);
  if (!h.length) return SPORTS[state.sport].avgPoints;
  return h.reduce((a, g) => a + g.homeScore + g.awayScore, 0) / (2 * h.length);
}

const countCache = new WeakMap<EloState, Record<string, number>>();
/** Rated games per participant across the whole history (thin-history detection). */
export function gamesPlayed(state: EloState): Record<string, number> {
  let c = countCache.get(state);
  if (c) return c;
  c = {};
  for (const g of state.history) { c[g.home.id] = (c[g.home.id] || 0) + 1; c[g.away.id] = (c[g.away.id] || 0) + 1; }
  countCache.set(state, c);
  return c;
}
