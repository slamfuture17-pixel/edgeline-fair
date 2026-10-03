// Athlete-vs-athlete engine (tennis, MMA): match history via date-range scoreboards -> per-athlete Elo.
import { cached, TTL } from "./cache";
import { SPORTS, SportKey } from "./sports";
import { getJson, site, competitionToGame, splitSides, ScoreboardGame, RawEvent } from "./espn";
import { EloState, applyGame } from "./elo";
import type { GameResult } from "@/types";

export interface Match extends ScoreboardGame {
  eventId: string;
}

function quarters(year: number): [string, string][] {
  return [[`${year}0101`, `${year}0331`], [`${year}0401`, `${year}0630`], [`${year}0701`, `${year}0930`], [`${year}1001`, `${year}1231`]];
}

function eventMatches(sport: SportKey, e: RawEvent): Match[] {
  const out: Match[] = [];
  const want = sport === "atp" ? /^mens-singles$/ : sport === "wta" ? /^womens-singles$/ : /singles/;
  const comps = e.competitions && e.competitions.length ? e.competitions : (e.groupings || []).filter((g) => !g.grouping?.slug || want.test(g.grouping.slug)).flatMap((g) => g.competitions || []);
  for (const c of comps) {
    if (!c?.competitors || c.competitors.length !== 2) continue;
    if (c.competitors.some((x) => !x.athlete || /^(TBA|TBD|Opponent TBA|Qualifier)\b/i.test(x.athlete.displayName.trim()))) continue;
    const g = competitionToGame(e, c);
    if (!g) continue;
    if (g.status === "final") {
      const [home, away] = splitSides(c.competitors) as [NonNullable<ReturnType<typeof splitSides>[0]>, NonNullable<ReturnType<typeof splitSides>[1]>];
      g.homeScore = home.winner ? 1 : away.winner ? 0 : NaN;
      g.awayScore = away.winner ? 1 : home.winner ? 0 : NaN;
    }
    out.push({ ...g, eventId: e.id });
  }
  return out;
}

async function rangeMatches(sport: SportKey, from: string, to: string, ttl: number): Promise<Match[]> {
  return cached(`range:${sport}:${from}:${to}`, ttl, async () => {
    const d = await getJson<{ events?: RawEvent[] }>(site(sport, `scoreboard?dates=${from}-${to}&limit=200`)).catch(() => ({ events: [] as RawEvent[] }));
    return (d.events || []).flatMap((e) => (e ? eventMatches(sport, e) : []));
  });
}

export async function matchHistory(sport: SportKey): Promise<Match[]> {
  const cfg = SPORTS[sport];
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10).replace(/-/g, "");
  const all: Match[] = [];
  for (const y of cfg.seasons) {
    for (const [from, to] of quarters(y)) {
      if (from > todayKey) continue;
      const past = to < todayKey;
      const ms = await rangeMatches(sport, from, past ? to : todayKey, past ? TTL.month : TTL.sixHours);
      all.push(...ms.filter((m) => m.status === "final" && isFinite(m.homeScore ?? NaN)));
    }
  }
  const seen = new Set<string>();
  return all.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).sort((a, b) => a.date.localeCompare(b.date));
}

const stateCache = new Map<string, { exp: number; state: EloState }>();

export async function buildAthleteElo(sport: SportKey): Promise<EloState> {
  const c = stateCache.get(sport);
  if (c && c.exp > Date.now()) return c.state;
  const hist = await matchHistory(sport);
  const state: EloState = { sport, ratings: {}, lastGame: {}, recent: {}, history: [], builtAt: new Date().toISOString() };
  for (const m of hist) {
    const g: GameResult = { id: m.id, eventId: m.eventId, sport, season: Number(m.date.slice(0, 4)), seasonType: 2, date: m.date, home: m.home, away: m.away, homeScore: m.homeScore!, awayScore: m.awayScore!, final: true };
    state.history.push(applyGame(state, g));
  }
  stateCache.set(sport, { exp: Date.now() + 30 * 60_000, state });
  return state;
}

export async function upcomingMatches(sport: SportKey, days: number): Promise<Match[]> {
  const now = new Date();
  const from = now.toISOString().slice(0, 10).replace(/-/g, "");
  const to = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const cur = await cached(`cur:${sport}`, TTL.minute, async () => {
    const d = await getJson<{ events?: RawEvent[] }>(site(sport, "scoreboard")).catch(() => ({ events: [] as RawEvent[] }));
    return (d.events || []).flatMap((e) => (e ? eventMatches(sport, e) : []));
  });
  const ahead = await rangeMatches(sport, from, to, TTL.fiveMin);
  const map = new Map<string, Match>();
  for (const m of [...ahead, ...cur]) map.set(m.id, m);
  return [...map.values()].filter((m) => m.status !== "final" || m.date.slice(0, 10) === now.toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date));
}

export function matchCounts(state: EloState): Record<string, number> {
  const n: Record<string, number> = {};
  for (const g of state.history) { n[g.home.id] = (n[g.home.id] || 0) + 1; n[g.away.id] = (n[g.away.id] || 0) + 1; }
  return n;
}

export function recentResults(state: EloState, id: string, k = 5): string {
  const rows = state.history.filter((g) => g.home.id === id || g.away.id === id).slice(-k);
  return rows.map((g) => ((g.home.id === id ? g.homeScore > g.awayScore : g.awayScore > g.homeScore) ? "W" : "L")).join("");
}

export async function rankings(sport: SportKey): Promise<Record<string, number>> {
  if (SPORTS[sport].group !== "Tennis") return {};
  return cached(`rank:${sport}`, TTL.day, async () => {
    type R = { rankings?: { ranks?: { current: number; athlete: { id: string } }[] }[] };
    const d = await getJson<R>(site(sport, "rankings")).catch(() => ({} as R));
    const out: Record<string, number> = {};
    for (const r of d.rankings?.[0]?.ranks || []) out[r.athlete.id] = r.current;
    return out;
  });
}
