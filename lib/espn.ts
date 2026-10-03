// ESPN public data adapter for team leagues. Typed, cached, point-in-time aware.
import { cached, TTL } from "./cache";
import { SPORTS, SportKey, currentSeason } from "./sports";
import type { GameResult, MarketLines, TeamRef } from "@/types";

const UA = { "User-Agent": "Mozilla/5.0 (EdgeLine Fair research client)" };

export async function getJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA, cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return (await res.json()) as T;
}

function withQuery(url: string, extra?: string): string {
  if (!extra) return url;
  return url + (url.includes("?") ? "&" : "?") + extra;
}

export function site(sport: SportKey, p: string, useQuery = false) {
  const base = `https://site.api.espn.com/apis/site/v2/sports/${SPORTS[sport].espnPath}/${p}`;
  return useQuery ? withQuery(base, SPORTS[sport].query) : base;
}
export function core(sport: SportKey, p: string) {
  return `https://sports.core.api.espn.com/v2/sports/${SPORTS[sport].coreLeaguePath}/${p}`;
}

export interface RawTeam { id: string; abbreviation?: string; displayName: string; shortDisplayName?: string; logo?: string; logos?: { href: string }[]; color?: string }
export interface RawCompetitor {
  id: string; homeAway?: "home" | "away"; order?: number; score?: string | { value: number }; winner?: boolean;
  team?: RawTeam; athlete?: { id?: string; displayName: string; shortName?: string; fullName?: string; flag?: { href: string } };
  records?: { summary: string; type?: string; name?: string }[]; curatedRank?: { current?: number }; linescores?: { value: number }[];
}
interface RawStatus { type: { name: string; detail: string; shortDetail: string; completed: boolean; state: string } }
export interface RawCompetition {
  id: string; date?: string; venue?: { fullName: string }; broadcasts?: { names: string[] }[]; status?: RawStatus;
  competitors: RawCompetitor[]; odds?: unknown[]; round?: { displayName?: string }; type?: { slug?: string; text?: string };
}
export interface RawEvent {
  id: string; date: string; name: string; shortName: string;
  season?: { year: number; type: number };
  seasonType?: { id: string };
  competitions?: RawCompetition[];
  groupings?: { grouping?: { slug?: string; displayName?: string }; competitions?: RawCompetition[] }[];
  status?: RawStatus;
}

export function toTeam(c: RawCompetitor): TeamRef {
  if (c.team) {
    const t = c.team;
    return {
      id: t.id,
      abbr: t.abbreviation || t.shortDisplayName?.slice(0, 4).toUpperCase() || t.displayName.slice(0, 3).toUpperCase(),
      name: t.shortDisplayName || t.displayName,
      logo: t.logo || t.logos?.[0]?.href,
      color: t.color,
      record: c.records?.find((r) => !r.type || r.type === "total")?.summary,
      rank: c.curatedRank?.current && c.curatedRank.current <= 25 ? c.curatedRank.current : undefined,
    };
  }
  const a = c.athlete!;
  return { id: a.id || c.id, abbr: a.shortName || a.displayName, name: a.displayName, logo: a.flag?.href, record: c.records?.[0]?.summary };
}

export function scoreOf(c: RawCompetitor): number {
  if (typeof c.score === "string") return Number(c.score);
  if (c.score && typeof c.score === "object") return Number(c.score.value);
  return NaN;
}

/** Home/away split; when the feed has no homeAway flag (MMA), ESPN's `order` 1 = home side of the odds record. */
export function splitSides(competitors: RawCompetitor[]): [RawCompetitor | undefined, RawCompetitor | undefined] {
  const home = competitors.find((x) => x.homeAway === "home");
  const away = competitors.find((x) => x.homeAway === "away");
  if (home && away) return [home, away];
  const sorted = [...competitors].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return [sorted[0], sorted[1]];
}

function eventToResult(sport: SportKey, e: RawEvent, fallbackSeason: number, fallbackType: number): GameResult | undefined {
  const c = e.competitions?.[0];
  if (!c) return undefined;
  const [home, away] = splitSides(c.competitors);
  if (!home || !away) return undefined;
  const status = c.status?.type || e.status?.type;
  return {
    id: e.id,
    sport,
    season: e.season?.year ?? fallbackSeason,
    // Soccer season-type ids are league-specific (regular season is often "1"); only US leagues use 1 = preseason.
    seasonType: SPORTS[sport].draws ? 2 : Number(e.seasonType?.id ?? e.season?.type ?? fallbackType),
    date: e.date,
    home: toTeam(home),
    away: toTeam(away),
    homeScore: scoreOf(home),
    awayScore: scoreOf(away),
    final: !!status?.completed,
  };
}

export async function listTeams(sport: SportKey): Promise<TeamRef[]> {
  return cached(`teams:${sport}`, TTL.day, async () => {
    const d = await getJson<{ sports: { leagues: { teams: { team: RawTeam }[] }[] }[] }>(site(sport, "teams?limit=500", true));
    return d.sports[0].leagues[0].teams.map(({ team }) => ({
      id: team.id,
      abbr: team.abbreviation || team.displayName.slice(0, 3).toUpperCase(),
      name: team.shortDisplayName || team.displayName,
      logo: team.logos?.[0]?.href,
      color: team.color,
    }));
  });
}

export async function teamSchedule(sport: SportKey, teamId: string, season: number): Promise<GameResult[]> {
  const isPast = season < currentSeason(sport);
  return cached(`sched:${sport}:${teamId}:${season}`, isPast ? TTL.month : TTL.thirtyMin, async () => {
    const out: GameResult[] = [];
    const types: (number | undefined)[] = SPORTS[sport].draws ? [undefined] : [2, 3];
    for (const st of types) {
      let d: { events?: RawEvent[] };
      try {
        d = await getJson(site(sport, `teams/${teamId}/schedule?season=${season}${st ? `&seasontype=${st}` : ""}`));
      } catch {
        continue;
      }
      for (const e of d.events || []) {
        const r = e && eventToResult(sport, e, season, st ?? 2);
        if (r) out.push(r);
      }
    }
    return out;
  });
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function mapBatch<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const res = await Promise.all(items.slice(i, i + size).map(fn));
    out.push(...res);
  }
  return out;
}

/** All games (deduped, chronological) for a season. Strategy depends on league size. */
export async function seasonGames(sport: SportKey, season: number): Promise<GameResult[]> {
  const cfg = SPORTS[sport];
  const isPast = season < currentSeason(sport);
  return cached(`season:${sport}:${season}`, isPast ? TTL.month : TTL.thirtyMin, async () => {
    const map = new Map<string, GameResult>();
    if (cfg.ingest === "weekly") {
      const weeks = Array.from({ length: cfg.weeks ?? 16 }, (_, i) => ({ st: 2, w: i + 1 })).concat([{ st: 3, w: 1 }]);
      const lists = await mapBatch(weeks, 6, async ({ st, w }) => {
        const d = await getJson<{ events?: RawEvent[] }>(site(sport, `scoreboard?dates=${season}&seasontype=${st}&week=${w}`, true)).catch(() => ({ events: [] as RawEvent[] }));
        return (d.events || []).map((e) => eventToResult(sport, e, season, st)).filter((x): x is GameResult => !!x);
      });
      for (const l of lists) for (const g of l) map.set(g.id, g);
    } else if (cfg.ingest === "daily") {
      const [s, e] = cfg.dailyWindow ?? ["1101", "0410"];
      const start = new Date(`${season - 1}-${s.slice(0, 2)}-${s.slice(2)}T00:00:00Z`);
      const end = new Date(`${season}-${e.slice(0, 2)}-${e.slice(2)}T00:00:00Z`);
      const today = new Date();
      const days: string[] = [];
      for (let d = new Date(start); d <= end && d <= today; d = new Date(d.getTime() + 86_400_000)) days.push(yyyymmdd(d));
      const lists = await mapBatch(days, 8, async (day) => {
        const d = await getJson<{ events?: RawEvent[] }>(site(sport, `scoreboard?dates=${day}`, true)).catch(() => ({ events: [] as RawEvent[] }));
        return (d.events || []).map((ev) => eventToResult(sport, ev, season, 2)).filter((x): x is GameResult => !!x);
      });
      for (const l of lists) for (const g of l) map.set(g.id, g);
    } else {
      const teams = await listTeams(sport);
      const lists = await mapBatch(teams, 8, (t) => teamSchedule(sport, t.id, season).catch(() => [] as GameResult[]));
      for (const l of lists) for (const g of l) map.set(g.id, g);
    }
    return [...map.values()].filter((g) => g.seasonType !== 1).sort((a, b) => a.date.localeCompare(b.date));
  });
}

export interface ScoreboardGame {
  id: string;
  date: string;
  name: string;
  shortName: string;
  status: "scheduled" | "live" | "final";
  statusDetail: string;
  home: TeamRef;
  away: TeamRef;
  homeScore?: number;
  awayScore?: number;
  venue?: string;
  broadcast?: string;
  seasonType: number;
  eventName?: string;
  round?: string;
}

export function competitionToGame(e: RawEvent, c: RawCompetition): ScoreboardGame | undefined {
  const [home, away] = splitSides(c.competitors);
  if (!home || !away) return undefined;
  const st = c.status?.type || e.status?.type;
  const state = st?.state === "in" ? "live" : st?.completed ? "final" : "scheduled";
  return {
    id: c.id || e.id,
    date: c.date || e.date,
    name: e.name,
    shortName: e.shortName,
    status: state,
    statusDetail: st?.shortDetail || st?.detail || "",
    home: toTeam(home),
    away: toTeam(away),
    homeScore: state === "scheduled" ? undefined : scoreOf(home),
    awayScore: state === "scheduled" ? undefined : scoreOf(away),
    venue: c.venue?.fullName,
    broadcast: c.broadcasts?.[0]?.names?.[0],
    seasonType: Number(e.season?.type ?? 2),
    eventName: e.name,
    round: c.round?.displayName,
  };
}

export async function scoreboard(sport: SportKey, yyyymmddStr?: string): Promise<ScoreboardGame[]> {
  const q = yyyymmddStr ? `scoreboard?dates=${yyyymmddStr}` : "scoreboard";
  return cached(`sb:${sport}:${yyyymmddStr ?? "now"}`, TTL.minute, async () => {
    const d = await getJson<{ events?: RawEvent[] }>(site(sport, q, true));
    const out: ScoreboardGame[] = [];
    for (const e of d.events || []) {
      const c = e?.competitions?.[0];
      if (!c) continue;
      const g = competitionToGame(e, c);
      if (g) out.push({ ...g, id: e.id });
    }
    return out;
  });
}

/** Upcoming games: weekly leagues use the current week; others scan the next `days` days. */
export async function upcoming(sport: SportKey, days: number): Promise<ScoreboardGame[]> {
  if (SPORTS[sport].ingest === "weekly" || sport === "nfl") return scoreboard(sport);
  const out = new Map<string, ScoreboardGame>();
  const now = new Date();
  const keys = Array.from({ length: days }, (_, i) => yyyymmdd(new Date(now.getTime() + i * 86_400_000)));
  const lists = await Promise.all(keys.map((k) => scoreboard(sport, k).catch(() => [] as ScoreboardGame[])));
  for (const l of lists) for (const g of l) out.set(g.id, g);
  if (out.size === 0) {
    const next = await scoreboard(sport).catch(() => [] as ScoreboardGame[]);
    for (const g of next) out.set(g.id, g);
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

interface RawPrice { american?: string; decimal?: number; value?: number }
interface RawSideOdds {
  moneyLine?: number; spreadOdds?: number; favorite?: boolean;
  open?: { moneyLine?: RawPrice; pointSpread?: { american?: string }; spread?: RawPrice };
  close?: { moneyLine?: RawPrice; pointSpread?: { american?: string }; spread?: RawPrice };
  current?: { moneyLine?: RawPrice; pointSpread?: { american?: string }; spread?: RawPrice };
}
interface RawOdds {
  provider: { name: string; id: string };
  details?: string; overUnder?: number; spread?: number; overOdds?: number; underOdds?: number;
  homeTeamOdds?: RawSideOdds; awayTeamOdds?: RawSideOdds;
  homeAthleteOdds?: RawSideOdds; awayAthleteOdds?: RawSideOdds;
  drawOdds?: { moneyLine?: number; close?: { moneyLine?: RawPrice }; open?: { moneyLine?: RawPrice } };
  open?: { over?: RawPrice; under?: RawPrice; total?: RawPrice };
  close?: { over?: RawPrice; under?: RawPrice; total?: RawPrice };
  current?: { over?: RawPrice; under?: RawPrice; total?: RawPrice };
}

function am(p?: RawPrice | { american?: string }): number | undefined {
  if (!p || !("american" in p) || p.american == null) return undefined;
  const n = Number(String(p.american).replace("EVEN", "+100"));
  return isFinite(n) ? n : undefined;
}
function num(p?: RawPrice | { american?: string }): number | undefined {
  if (!p) return undefined;
  if ("value" in p && typeof p.value === "number") return p.value;
  if ("american" in p && p.american != null) {
    const n = Number(String(p.american).replace("EVEN", "0"));
    return isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Odds for an event; `compId` differs from the event id for cards (MMA) and tournaments (tennis). */
export async function eventOdds(sport: SportKey, eventId: string, final = false, compId?: string): Promise<MarketLines | undefined> {
  const cid = compId ?? eventId;
  return cached(`odds:${sport}:${eventId}:${cid}`, final ? TTL.month : TTL.fiveMin, async () => {
    const d = await getJson<{ items?: RawOdds[] }>(core(sport, `events/${eventId}/competitions/${cid}/odds`));
    const items = d.items || [];
    if (!items.length) return undefined;
    const o = items.find((x) => x.provider?.id === "100") || items[0];
    const h = o.homeTeamOdds ?? o.homeAthleteOdds, a = o.awayTeamOdds ?? o.awayAthleteOdds;
    let spreadHome: number | undefined;
    if (typeof o.spread === "number") spreadHome = h?.favorite ? -Math.abs(o.spread) : Math.abs(o.spread);
    const curHomePS = num(h?.current?.pointSpread);
    if (curHomePS !== undefined) spreadHome = curHomePS;
    const lines: MarketLines = {
      provider: o.provider?.name || "Book",
      homeML: h?.moneyLine ?? am(h?.current?.moneyLine),
      awayML: a?.moneyLine ?? am(a?.current?.moneyLine),
      drawML: o.drawOdds?.moneyLine,
      spreadHome,
      spreadHomeOdds: h?.spreadOdds ?? am(h?.current?.spread),
      spreadAwayOdds: a?.spreadOdds ?? am(a?.current?.spread),
      total: o.overUnder ?? num(o.current?.total),
      overOdds: o.overOdds ?? am(o.current?.over),
      underOdds: o.underOdds ?? am(o.current?.under),
      openSpreadHome: num(h?.open?.pointSpread),
      openTotal: num(o.open?.total),
      openHomeML: am(h?.open?.moneyLine),
      openAwayML: am(a?.open?.moneyLine),
      closeHomeML: am(h?.close?.moneyLine),
      closeAwayML: am(a?.close?.moneyLine),
      closeDrawML: am(o.drawOdds?.close?.moneyLine),
      closeSpreadHome: num(h?.close?.pointSpread),
      closeTotal: num(o.close?.total),
    };
    if (!SPORTS[sport].hasSpread) { lines.spreadHome = undefined; lines.openSpreadHome = undefined; lines.closeSpreadHome = undefined; }
    if (!SPORTS[sport].hasTotal) { lines.total = undefined; lines.openTotal = undefined; lines.closeTotal = undefined; }
    return lines;
  });
}

export interface RawProp { athleteId?: string; teamId?: string; typeName: string; target?: number; openTarget?: number; updated?: string }

export async function eventProps(sport: SportKey, eventId: string): Promise<RawProp[]> {
  return cached(`props:${sport}:${eventId}`, TTL.fiveMin, async () => {
    type Item = { athlete?: { $ref: string }; team?: { $ref: string }; type: { name: string }; lastUpdated?: string; current?: { target?: { value: number } }; open?: { target?: { value: number } } };
    const items: Item[] = [];
    for (let page = 1; page <= 5; page++) {
      const d = await getJson<{ items?: Item[]; pageCount?: number }>(core(sport, `events/${eventId}/competitions/${eventId}/odds/100/propBets?limit=1000&page=${page}`)).catch(() => ({ items: [] as Item[], pageCount: 0 }));
      items.push(...(d.items || []));
      if (!d.pageCount || page >= d.pageCount) break;
    }
    return items.map((it) => ({
      athleteId: it.athlete?.$ref.match(/athletes\/(\d+)/)?.[1],
      teamId: it.team?.$ref.match(/teams\/(\d+)/)?.[1],
      typeName: it.type.name,
      target: it.current?.target?.value,
      openTarget: it.open?.target?.value,
      updated: it.lastUpdated,
    }));
  });
}

export interface RosterPlayer { id: string; name: string; position: string; jersey?: string; headshot?: string; injury?: string; teamAbbr: string }

export async function roster(sport: SportKey, teamId: string): Promise<RosterPlayer[]> {
  return cached(`roster:${sport}:${teamId}`, TTL.sixHours, async () => {
    type A = { id: string; fullName: string; position?: { abbreviation: string }; jersey?: string; headshot?: { href: string }; injuries?: { status: string }[] };
    const d = await getJson<{ athletes: (A | { items: A[] })[]; team: { abbreviation: string } }>(site(sport, `teams/${teamId}/roster`));
    const flat: A[] = [];
    for (const g of d.athletes) {
      if ("items" in g) flat.push(...g.items); else flat.push(g);
    }
    return flat.map((a) => ({
      id: a.id, name: a.fullName, position: a.position?.abbreviation || "", jersey: a.jersey,
      headshot: a.headshot?.href, injury: a.injuries?.[0]?.status, teamAbbr: d.team.abbreviation,
    }));
  });
}

export interface GameLogRow { eventId: string; date: string; stats: Record<string, number> }

export async function gameLog(sport: SportKey, athleteId: string, season?: number): Promise<GameLogRow[]> {
  const key = `gl:${sport}:${athleteId}:${season ?? "cur"}`;
  const isPast = season !== undefined && season < currentSeason(sport);
  return cached(key, isPast ? TTL.month : TTL.sixHours, async () => {
    type GL = { names?: string[]; events?: Record<string, { gameDate?: string }>; seasonTypes?: { displayName: string; categories?: { events?: { eventId: string; stats: string[] }[] }[] }[] };
    const url = `https://site.web.api.espn.com/apis/common/v3/sports/${SPORTS[sport].espnPath}/athletes/${athleteId}/gamelog${season ? `?season=${season}` : ""}`;
    const d = await getJson<GL>(url).catch(() => ({} as GL));
    const names = d.names || [];
    const rows: GameLogRow[] = [];
    for (const st of d.seasonTypes || []) {
      if (/preseason/i.test(st.displayName)) continue;
      for (const cat of st.categories || []) {
        for (const ev of cat.events || []) {
          const stats: Record<string, number> = {};
          names.forEach((n, i) => {
            const raw = ev.stats[i];
            if (raw == null || raw === "-") return;
            if (n.includes("-") && typeof raw === "string" && raw.includes("-")) {
              const [a, b] = n.split("-");
              const [x, y] = raw.split("-").map(Number);
              stats[a] = x; stats[b] = y;
            } else {
              const v = Number(String(raw).replace(/,/g, ""));
              if (isFinite(v)) stats[n] = v;
            }
          });
          rows.push({ eventId: ev.eventId, date: d.events?.[ev.eventId]?.gameDate || "", stats });
        }
      }
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  });
}

export interface Injury { team: string; player: string; position: string; status: string; detail?: string }

export async function injuries(sport: SportKey, eventId: string): Promise<Injury[]> {
  if (SPORTS[sport].kind === "athlete") return [];
  return cached(`inj:${sport}:${eventId}`, TTL.thirtyMin, async () => {
    type S = { injuries?: { team: { abbreviation: string }; injuries: { status: string; athlete: { displayName: string; position?: { abbreviation: string } }; details?: { type?: string } }[] }[] };
    const d = await getJson<S>(site(sport, `summary?event=${eventId}`)).catch(() => ({} as S));
    const out: Injury[] = [];
    for (const t of d.injuries || []) {
      for (const i of t.injuries || []) {
        out.push({ team: t.team.abbreviation, player: i.athlete.displayName, position: i.athlete.position?.abbreviation || "", status: i.status, detail: i.details?.type });
      }
    }
    return out;
  });
}
