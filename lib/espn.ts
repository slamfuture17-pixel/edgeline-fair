// ESPN public data adapter. Every function is typed, cached and point-in-time aware.
import { cached, TTL } from "./cache";
import { SPORTS, SportKey, currentSeason } from "./sports";
import type { GameResult, MarketLines, TeamRef } from "@/types";

const UA = { "User-Agent": "Mozilla/5.0 (EdgeLine Fair research client)" };

async function getJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA, cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return (await res.json()) as T;
}

function site(sport: SportKey, p: string) {
  return `https://site.api.espn.com/apis/site/v2/sports/${SPORTS[sport].espnPath}/${p}`;
}
function core(sport: SportKey, p: string) {
  return `https://sports.core.api.espn.com/v2/sports/${SPORTS[sport].coreLeaguePath}/${p}`;
}

interface RawTeam { id: string; abbreviation: string; displayName: string; shortDisplayName?: string; logo?: string; logos?: { href: string }[]; color?: string }
interface RawCompetitor { id: string; homeAway: "home" | "away"; score?: string | { value: number }; winner?: boolean; team: RawTeam; records?: { summary: string; type?: string }[] }
interface RawStatus { type: { name: string; detail: string; shortDetail: string; completed: boolean; state: string } }
interface RawEvent {
  id: string; date: string; name: string; shortName: string;
  season?: { year: number; type: number };
  seasonType?: { id: string };
  competitions: { id: string; venue?: { fullName: string }; broadcasts?: { names: string[] }[]; status?: RawStatus; competitors: RawCompetitor[] }[];
  status?: RawStatus;
}

function toTeam(c: RawCompetitor): TeamRef {
  const t = c.team;
  return {
    id: t.id,
    abbr: t.abbreviation,
    name: t.shortDisplayName || t.displayName,
    logo: t.logo || t.logos?.[0]?.href,
    color: t.color,
    record: c.records?.find((r) => !r.type || r.type === "total")?.summary,
  };
}

function scoreOf(c: RawCompetitor): number {
  if (typeof c.score === "string") return Number(c.score);
  if (c.score && typeof c.score === "object") return Number(c.score.value);
  return NaN;
}

export async function listTeams(sport: SportKey): Promise<TeamRef[]> {
  return cached(`teams:${sport}`, TTL.day, async () => {
    const d = await getJson<{ sports: { leagues: { teams: { team: RawTeam }[] }[] }[] }>(site(sport, "teams?limit=50"));
    return d.sports[0].leagues[0].teams.map(({ team }) => ({
      id: team.id, abbr: team.abbreviation, name: team.shortDisplayName || team.displayName, logo: team.logos?.[0]?.href, color: team.color,
    }));
  });
}

export async function teamSchedule(sport: SportKey, teamId: string, season: number): Promise<GameResult[]> {
  const isPast = season < currentSeason(sport);
  return cached(`sched:${sport}:${teamId}:${season}`, isPast ? TTL.month : TTL.thirtyMin, async () => {
    const out: GameResult[] = [];
    for (const st of [2, 3]) {
      let d: { events?: RawEvent[] };
      try {
        d = await getJson(site(sport, `teams/${teamId}/schedule?season=${season}&seasontype=${st}`));
      } catch {
        continue;
      }
      for (const e of d.events || []) {
        const c = e.competitions[0];
        const home = c.competitors.find((x) => x.homeAway === "home");
        const away = c.competitors.find((x) => x.homeAway === "away");
        if (!home || !away) continue;
        const status = c.status?.type || e.status?.type;
        out.push({
          id: e.id, sport, season: e.season?.year ?? season,
          seasonType: Number(e.seasonType?.id ?? e.season?.type ?? st),
          date: e.date, home: toTeam(home), away: toTeam(away),
          homeScore: scoreOf(home), awayScore: scoreOf(away), final: !!status?.completed,
        });
      }
    }
    return out;
  });
}

/** All games (deduped, chronological) for a season across every team. */
export async function seasonGames(sport: SportKey, season: number): Promise<GameResult[]> {
  const isPast = season < currentSeason(sport);
  return cached(`season:${sport}:${season}`, isPast ? TTL.month : TTL.thirtyMin, async () => {
    const teams = await listTeams(sport);
    const map = new Map<string, GameResult>();
    const batch = 8;
    for (let i = 0; i < teams.length; i += batch) {
      const chunk = teams.slice(i, i + batch);
      const res = await Promise.all(chunk.map((t) => teamSchedule(sport, t.id, season).catch(() => [] as GameResult[])));
      for (const list of res) for (const g of list) map.set(g.id, g);
    }
    return [...map.values()].filter((g) => g.seasonType !== 1).sort((a, b) => a.date.localeCompare(b.date));
  });
}

export interface ScoreboardGame {
  id: string; date: string; name: string; shortName: string;
  status: "scheduled" | "live" | "final"; statusDetail: string;
  home: TeamRef; away: TeamRef; homeScore?: number; awayScore?: number;
  venue?: string; broadcast?: string; seasonType: number;
}

export async function scoreboard(sport: SportKey, yyyymmdd?: string): Promise<ScoreboardGame[]> {
  const q = yyyymmdd ? `scoreboard?dates=${yyyymmdd}` : "scoreboard";
  return cached(`sb:${sport}:${yyyymmdd ?? "now"}`, TTL.minute, async () => {
    const d = await getJson<{ events: RawEvent[] }>(site(sport, q));
    return (d.events || []).map((e) => {
      const c = e.competitions[0];
      const home = c.competitors.find((x) => x.homeAway === "home")!;
      const away = c.competitors.find((x) => x.homeAway === "away")!;
      const st = c.status?.type || e.status?.type;
      const state = st?.state === "in" ? "live" : st?.completed ? "final" : "scheduled";
      return {
        id: e.id, date: e.date, name: e.name, shortName: e.shortName, status: state,
        statusDetail: st?.shortDetail || st?.detail || "",
        home: toTeam(home), away: toTeam(away),
        homeScore: state === "scheduled" ? undefined : scoreOf(home),
        awayScore: state === "scheduled" ? undefined : scoreOf(away),
        venue: c.venue?.fullName, broadcast: c.broadcasts?.[0]?.names?.[0],
        seasonType: Number(e.season?.type ?? 2),
      } satisfies ScoreboardGame;
    });
  });
}

/** Scoreboard for a window of days (NFL uses the current week; others per-date). */
export async function upcoming(sport: SportKey, days: number): Promise<ScoreboardGame[]> {
  if (sport === "nfl") return scoreboard(sport);
  const out = new Map<string, ScoreboardGame>();
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(0, 10).replace(/-/g, "");
    const games = await scoreboard(sport, key).catch(() => [] as ScoreboardGame[]);
    for (const g of games) out.set(g.id, g);
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

export async function eventOdds(sport: SportKey, eventId: string, final = false): Promise<MarketLines | undefined> {
  return cached(`odds:${sport}:${eventId}`, final ? TTL.month : TTL.fiveMin, async () => {
    const d = await getJson<{ items?: RawOdds[] }>(core(sport, `events/${eventId}/competitions/${eventId}/odds`));
    const items = d.items || [];
    if (!items.length) return undefined;
    const o = items.find((x) => x.provider?.id === "100") || items[0];
    const h = o.homeTeamOdds, a = o.awayTeamOdds;
    let spreadHome: number | undefined;
    if (typeof o.spread === "number") spreadHome = h?.favorite ? -Math.abs(o.spread) : Math.abs(o.spread);
    const curHomePS = num(h?.current?.pointSpread);
    if (curHomePS !== undefined) spreadHome = curHomePS;
    const lines: MarketLines = {
      provider: o.provider?.name || "Book",
      homeML: h?.moneyLine ?? am(h?.current?.moneyLine),
      awayML: a?.moneyLine ?? am(a?.current?.moneyLine),
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
      closeSpreadHome: num(h?.close?.pointSpread),
      closeTotal: num(o.close?.total),
    };
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
