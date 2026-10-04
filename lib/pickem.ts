// Pick'em / DFS prop lines: PrizePicks (partner feed) and Underdog (public lines feed).
import { cached } from "./cache";
import { getJson } from "./espn";

export type PickemSite = "prizepicks" | "underdog";
export interface PickemLine {
  site: PickemSite;
  league: string;
  player: string;
  team?: string;
  statRaw: string;
  statKey?: string;
  line: number;
  oddsType?: string; // prizepicks: standard | goblin | demon
  allowed?: "over" | "under" | "both";
  overPrice?: number; // american (underdog)
  underPrice?: number;
  startTime?: string;
}

export const PICKEM_LABEL: Record<PickemSite, string> = { prizepicks: "PrizePicks", underdog: "Underdog" };

/** Map vendor stat names to our game-log stat keys. Returns undefined for partial-game / unsupported stats. */
export function normalizeStat(raw: string): string | undefined {
  const s = raw.toLowerCase().replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(1q|1h|2h|1p|2p|3p|first|last|anytime|fantasy|tackles|sacks|targets|fumbles|kills|maps|set|period|quarter|half|td|tds|touchdown)\b/.test(s)) return undefined;
  const table: [RegExp, string][] = [
    [/^(rec|receiving) (yards|yds)$/, "receivingYards"],
    [/^(rush|rushing) (yards|yds)$/, "rushingYards"],
    [/^(pass|passing) (yards|yds)$/, "passingYards"],
    [/^receptions$/, "receptions"],
    [/^(rush|rushing) attempts$|^carries$/, "rushingAttempts"],
    [/^(pass|passing) attempts$/, "passingAttempts"],
    [/^(pass|passing)? ?completions$/, "completions"],
    [/^(interceptions|ints)( thrown)?$/, "interceptions"],
    [/^longest reception$/, "longReception"],
    [/^longest rush$/, "longRushing"],
    [/^rush ?\+ ?rec (yards|yds)$|^rushing ?\+ ?receiving (yards|yds)$/, "rushRecYards"],
    [/^pass ?\+ ?rush (yards|yds)$|^passing ?\+ ?rushing (yards|yds)$/, "passRushYards"],
    [/^points$|^pts$/, "points"],
    [/^rebounds$|^rebs$/, "totalRebounds"],
    [/^assists$|^asts$/, "assists"],
    [/^3 ?pt made$|^3 pointers made$|^threes made$|^3pm$|^3 point (fg|field goals) made$/, "threePointFieldGoalsMade"],
    [/^pts ?\+ ?rebs ?\+ ?asts$|^points ?\+ ?rebounds ?\+ ?assists$|^pra$/, "pra"],
    [/^pts ?\+ ?rebs$|^points ?\+ ?rebounds$/, "pr"],
    [/^pts ?\+ ?asts$|^points ?\+ ?assists$/, "pa"],
    [/^rebs ?\+ ?asts$|^rebounds ?\+ ?assists$/, "ra"],
    [/^steals$/, "steals"], [/^blocks$|^blocked shots$/, "blocks"], [/^turnovers$/, "turnovers"],
    [/^shots on goal$|^sog$/, "shotsTotal"], [/^goals$/, "goals"], [/^saves$|^goalie saves$/, "saves"],
    [/^(pitcher )?strikeouts$|^ks$/, "strikeouts"], [/^hits$/, "hits"], [/^total bases$/, "totalBases"], [/^rbis$|^runs batted in$/, "RBIs"],
    [/^runs$|^runs scored$/, "runs"], [/^home runs$/, "homeRuns"], [/^hits ?\+ ?runs ?\+ ?rbis$/, "hrr"],
    [/^earned runs( allowed)?$/, "earnedRuns"], [/^hits allowed$/, "hitsAllowed"], [/^walks( allowed)?$/, "walks"],
  ];
  for (const [re, key] of table) if (re.test(s)) return key;
  return undefined;
}

const PP_LEAGUE: Record<string, string> = { "9": "nfl", "7": "nba", "3": "wnba", "8": "nhl", "2": "mlb", "15": "ncaaf", "20": "ncaab" };

/** PrizePicks board (all leagues). One request, cached 10 min server-wide to respect their rate limit. */
export async function prizepicksLines(): Promise<PickemLine[]> {
  return cached("pickem:prizepicks", 10 * 60_000, async () => {
    type Inc = { type: string; id: string; attributes: Record<string, unknown> };
    type Proj = { attributes: { line_score?: number; stat_type?: string; odds_type?: string; start_time?: string; status?: string; allowed_wager_types?: string }; relationships: { new_player?: { data?: { id: string } }; league?: { data?: { id: string } } } };
    const d = await getJson<{ data?: Proj[]; included?: Inc[] }>("https://partner-api.prizepicks.com/projections?per_page=250&single_stat=true").catch(() => ({ data: [] as Proj[], included: [] as Inc[] }));
    const players = new Map<string, Inc>();
    for (const i of d.included || []) if (i.type === "new_player") players.set(i.id, i);
    const out: PickemLine[] = [];
    for (const p of d.data || []) {
      const league = PP_LEAGUE[p.relationships.league?.data?.id ?? ""];
      if (!league || p.attributes.line_score === undefined) continue;
      const pl = players.get(p.relationships.new_player?.data?.id ?? "");
      if (!pl) continue;
      const statRaw = String(p.attributes.stat_type ?? "");
      out.push({ site: "prizepicks", league, player: String(pl.attributes.display_name ?? pl.attributes.name ?? ""), team: pl.attributes.team as string | undefined, statRaw, statKey: normalizeStat(statRaw), line: Number(p.attributes.line_score), oddsType: p.attributes.odds_type as string | undefined, allowed: p.attributes.allowed_wager_types === "over" ? "over" : p.attributes.allowed_wager_types === "under" ? "under" : "both", startTime: p.attributes.start_time as string | undefined });
    }
    return out;
  });
}

const UD_SPORT: Record<string, string> = { NFL: "nfl", NBA: "nba", WNBA: "wnba", NHL: "nhl", MLB: "mlb", CFB: "ncaaf", CBB: "ncaab" };

/** Underdog pick'em board. Cached 10 min. */
export async function underdogLines(): Promise<PickemLine[]> {
  return cached("pickem:underdog", 10 * 60_000, async () => {
    type Opt = { choice?: string; american_price?: string };
    type OU = { over_under?: { appearance_stat?: { appearance_id?: string; display_stat?: string; stat?: string }; title?: string }; stat_value?: string; options?: Opt[]; status?: string };
    type App = { id: string; player_id?: string; match_id?: number; team_id?: string };
    type Pl = { id: string; first_name?: string; last_name?: string; sport_id?: string; team_id?: string };
    type Team = { id: string; abbr?: string };
    type Feed = { over_under_lines?: OU[]; appearances?: App[]; players?: Pl[]; teams?: Team[]; games?: { id: number; scheduled_at?: string }[] };
    const d: Feed = await getJson<Feed>("https://api.underdogfantasy.com/v1/over_under_lines").catch(() => ({} as Feed));
    const apps = new Map((d.appearances || []).map((a) => [a.id, a]));
    const players = new Map((d.players || []).map((p) => [p.id, p]));
    const games = new Map((d.games || []).map((g) => [g.id, g]));
    const out: PickemLine[] = [];
    for (const l of d.over_under_lines || []) {
      const st = l.over_under?.appearance_stat;
      const app = st?.appearance_id ? apps.get(st.appearance_id) : undefined;
      const pl = app?.player_id ? players.get(app.player_id) : undefined;
      if (!pl || !st) continue;
      const league = UD_SPORT[pl.sport_id ?? ""];
      if (!league) continue;
      const statRaw = st.display_stat || st.stat || "";
      const over = l.options?.find((o) => o.choice === "higher"), under = l.options?.find((o) => o.choice === "lower");
      out.push({
        site: "underdog", league, player: `${pl.first_name ?? ""} ${pl.last_name ?? ""}`.trim(), statRaw, statKey: normalizeStat(statRaw), line: Number(l.stat_value),
        overPrice: over?.american_price ? Number(over.american_price) : undefined, underPrice: under?.american_price ? Number(under.american_price) : undefined,
        startTime: app?.match_id ? games.get(app.match_id)?.scheduled_at : undefined,
      });
    }
    return out;
  });
}

export function normName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}

/** All pick'em lines for a league whose player names appear in the provided roster index. */
export async function pickemLinesFor(league: string, rosterNames: Map<string, string>): Promise<(PickemLine & { athleteId: string })[]> {
  const [pp, ud] = await Promise.all([prizepicksLines().catch(() => [] as PickemLine[]), underdogLines().catch(() => [] as PickemLine[])]);
  const out: (PickemLine & { athleteId: string })[] = [];
  for (const l of [...pp, ...ud]) {
    if (l.league !== league || !l.statKey || !isFinite(l.line)) continue;
    const id = rosterNames.get(normName(l.player));
    if (id) out.push({ ...l, athleteId: id });
  }
  return out;
}
