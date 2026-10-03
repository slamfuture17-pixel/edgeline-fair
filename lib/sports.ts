// Sport/league registry: ESPN paths, ingestion strategy, and model hyperparameters.
// Hyperparameters follow public Elo literature and are re-checked by scripts/backtest.ts.

export type SportGroup = "Football" | "Basketball" | "Baseball" | "Hockey" | "Soccer" | "Tennis" | "MMA";
export type Ingest = "schedule" | "weekly" | "daily" | "range";

export interface SportConfig {
  key: string;
  label: string;
  name: string;
  group: SportGroup;
  kind: "team" | "athlete";
  espnPath: string;
  coreLeaguePath: string;
  ingest: Ingest;
  query?: string;
  draws: boolean;
  hasSpread: boolean;
  hasTotal: boolean;
  k: number;
  homeAdv: number;
  eloPerPoint: number;
  marginSigma: number;
  totalSigma: number;
  carryover: number;
  movMultiplier: boolean;
  marketWeight: number;
  seasons: number[];
  avgPoints: number;
  weeks?: number;
  dailyWindow?: [string, string];
  propStatMap: Record<string, { statKey: string; dist: "normal" | "count"; label: string }>;
}

const Y = { nfl: 2026, nba: 2027, mlb: 2026, nhl: 2027, wnba: 2026, ncaaf: 2026, ncaab: 2027, soccerEU: 2026, soccerCal: 2026 };

const NONE = {} as SportConfig["propStatMap"];

function soccer(key: string, label: string, name: string, path: string, calendarYear = false, extra: Partial<SportConfig> = {}): SportConfig {
  const y = calendarYear ? Y.soccerCal : Y.soccerEU;
  return {
    key, label, name, group: "Soccer", kind: "team",
    espnPath: `soccer/${path}`, coreLeaguePath: `soccer/leagues/${path}`,
    ingest: "schedule", draws: true, hasSpread: false, hasTotal: true,
    k: 20, homeAdv: 60, eloPerPoint: 230, marginSigma: 1.35, totalSigma: 1.45, carryover: 0.8, movMultiplier: true,
    marketWeight: 0.75, seasons: [y - 1, y], avgPoints: 1.4,
    propStatMap: NONE, ...extra,
  };
}

const LIST: SportConfig[] = [
  {
    key: "nfl", label: "NFL", name: "NFL", group: "Football", kind: "team",
    espnPath: "football/nfl", coreLeaguePath: "football/leagues/nfl", ingest: "schedule", draws: false, hasSpread: true, hasTotal: true,
    k: 20, homeAdv: 48, eloPerPoint: 25, marginSigma: 13.4, totalSigma: 10.2, carryover: 0.67, movMultiplier: true, marketWeight: 0.7,
    seasons: [Y.nfl - 2, Y.nfl - 1, Y.nfl], avgPoints: 22.5,
    propStatMap: {
      "Total Passing Yards": { statKey: "passingYards", dist: "normal", label: "Pass Yds" },
      "Total Rushing Yards": { statKey: "rushingYards", dist: "normal", label: "Rush Yds" },
      "Total Receiving Yards": { statKey: "receivingYards", dist: "normal", label: "Rec Yds" },
      "Total Receptions": { statKey: "receptions", dist: "count", label: "Receptions" },
      "Total Passing Touchdowns": { statKey: "passingTouchdowns", dist: "count", label: "Pass TD" },
      "Total Passing Completions": { statKey: "completions", dist: "normal", label: "Completions" },
      "Total Passing Attempts": { statKey: "passingAttempts", dist: "normal", label: "Pass Att" },
      "Total Rushing Attempts": { statKey: "rushingAttempts", dist: "normal", label: "Rush Att" },
      "Total Interceptions": { statKey: "interceptions", dist: "count", label: "INT thrown" },
      "Total Rushing + Receiving Yards": { statKey: "rushRecYards", dist: "normal", label: "Rush+Rec Yds" },
      "Total Passing + Rushing Yards": { statKey: "passRushYards", dist: "normal", label: "Pass+Rush Yds" },
      "Longest Reception": { statKey: "longReception", dist: "normal", label: "Long Rec" },
      "Longest Rush": { statKey: "longRushing", dist: "normal", label: "Long Rush" },
    },
  },
  {
    key: "ncaaf", label: "NCAAF", name: "College Football (FBS)", group: "Football", kind: "team",
    espnPath: "football/college-football", coreLeaguePath: "football/leagues/college-football", ingest: "weekly", query: "groups=80&limit=300",
    draws: false, hasSpread: true, hasTotal: true,
    k: 24, homeAdv: 60, eloPerPoint: 22, marginSigma: 16.5, totalSigma: 12.5, carryover: 0.6, movMultiplier: true, marketWeight: 0.9,
    seasons: [Y.ncaaf - 1, Y.ncaaf], avgPoints: 28, weeks: 16, propStatMap: NONE,
  },
  {
    key: "nba", label: "NBA", name: "NBA", group: "Basketball", kind: "team",
    espnPath: "basketball/nba", coreLeaguePath: "basketball/leagues/nba", ingest: "schedule", draws: false, hasSpread: true, hasTotal: true,
    k: 20, homeAdv: 70, eloPerPoint: 28, marginSigma: 12.3, totalSigma: 18.5, carryover: 0.75, movMultiplier: true, marketWeight: 0.72,
    seasons: [Y.nba - 2, Y.nba - 1, Y.nba], avgPoints: 113,
    propStatMap: {
      "Total Points": { statKey: "points", dist: "normal", label: "Points" },
      "Total Rebounds": { statKey: "totalRebounds", dist: "count", label: "Rebounds" },
      "Total Assists": { statKey: "assists", dist: "count", label: "Assists" },
      "Total 3-Point Field Goals Made": { statKey: "threePointFieldGoalsMade", dist: "count", label: "3PM" },
      "Total Steals": { statKey: "steals", dist: "count", label: "Steals" },
      "Total Blocks": { statKey: "blocks", dist: "count", label: "Blocks" },
      "Total Turnovers": { statKey: "turnovers", dist: "count", label: "Turnovers" },
      "Total Points + Rebounds + Assists": { statKey: "pra", dist: "normal", label: "PRA" },
      "Total Points + Rebounds": { statKey: "pr", dist: "normal", label: "Pts+Reb" },
      "Total Points + Assists": { statKey: "pa", dist: "normal", label: "Pts+Ast" },
      "Total Rebounds + Assists": { statKey: "ra", dist: "normal", label: "Reb+Ast" },
    },
  },
  {
    key: "wnba", label: "WNBA", name: "WNBA", group: "Basketball", kind: "team",
    espnPath: "basketball/wnba", coreLeaguePath: "basketball/leagues/wnba", ingest: "schedule", draws: false, hasSpread: true, hasTotal: true,
    k: 20, homeAdv: 60, eloPerPoint: 28, marginSigma: 11.5, totalSigma: 15.5, carryover: 0.7, movMultiplier: true, marketWeight: 0.72,
    seasons: [Y.wnba - 1, Y.wnba], avgPoints: 82,
    propStatMap: {
      "Total Points": { statKey: "points", dist: "normal", label: "Points" },
      "Total Rebounds": { statKey: "totalRebounds", dist: "count", label: "Rebounds" },
      "Total Assists": { statKey: "assists", dist: "count", label: "Assists" },
      "Total 3-Point Field Goals Made": { statKey: "threePointFieldGoalsMade", dist: "count", label: "3PM" },
      "Total Points + Rebounds + Assists": { statKey: "pra", dist: "normal", label: "PRA" },
    },
  },
  {
    key: "ncaab", label: "NCAAB", name: "College Basketball (D-I)", group: "Basketball", kind: "team",
    espnPath: "basketball/mens-college-basketball", coreLeaguePath: "basketball/leagues/mens-college-basketball", ingest: "daily", query: "groups=50&limit=400",
    draws: false, hasSpread: true, hasTotal: true,
    k: 22, homeAdv: 90, eloPerPoint: 28, marginSigma: 11.0, totalSigma: 15.0, carryover: 0.55, movMultiplier: true, marketWeight: 0.7,
    seasons: [Y.ncaab - 1, Y.ncaab], avgPoints: 72, dailyWindow: ["1101", "0410"], propStatMap: NONE,
  },
  {
    key: "mlb", label: "MLB", name: "MLB", group: "Baseball", kind: "team",
    espnPath: "baseball/mlb", coreLeaguePath: "baseball/leagues/mlb", ingest: "schedule", draws: false, hasSpread: true, hasTotal: true,
    k: 4, homeAdv: 24, eloPerPoint: 95, marginSigma: 3.05, totalSigma: 3.4, carryover: 0.7, movMultiplier: false, marketWeight: 0.75,
    seasons: [Y.mlb - 1, Y.mlb], avgPoints: 4.4,
    propStatMap: {
      "Total Strikeouts": { statKey: "strikeouts", dist: "count", label: "Pitcher Ks" },
      "Total Hits": { statKey: "hits", dist: "count", label: "Hits" },
      "Total Bases": { statKey: "totalBases", dist: "count", label: "Total Bases" },
      "Total Runs Batted In": { statKey: "RBIs", dist: "count", label: "RBI" },
      "Total Home Runs": { statKey: "homeRuns", dist: "count", label: "HR" },
      "Total Runs Scored": { statKey: "runs", dist: "count", label: "Runs" },
      "Total Earned Runs Allowed": { statKey: "earnedRuns", dist: "count", label: "ER allowed" },
      "Total Hits Allowed": { statKey: "hitsAllowed", dist: "count", label: "Hits allowed" },
    },
  },
  {
    key: "nhl", label: "NHL", name: "NHL", group: "Hockey", kind: "team",
    espnPath: "hockey/nhl", coreLeaguePath: "hockey/leagues/nhl", ingest: "schedule", draws: false, hasSpread: true, hasTotal: true,
    k: 6, homeAdv: 33, eloPerPoint: 150, marginSigma: 2.25, totalSigma: 2.3, carryover: 0.7, movMultiplier: false, marketWeight: 0.75,
    seasons: [Y.nhl - 1, Y.nhl], avgPoints: 3.0,
    propStatMap: {
      "Total Shots on Goal": { statKey: "shotsTotal", dist: "count", label: "Shots" },
      "Total Points": { statKey: "points", dist: "count", label: "Points" },
      "Total Assists": { statKey: "assists", dist: "count", label: "Assists" },
      "Total Goals": { statKey: "goals", dist: "count", label: "Goals" },
      "Total Saves": { statKey: "saves", dist: "normal", label: "Saves" },
    },
  },
  soccer("epl", "EPL", "English Premier League", "eng.1"),
  soccer("laliga", "La Liga", "Spanish La Liga", "esp.1"),
  soccer("bundesliga", "Bundesliga", "German Bundesliga", "ger.1"),
  soccer("seriea", "Serie A", "Italian Serie A", "ita.1"),
  soccer("ligue1", "Ligue 1", "French Ligue 1", "fra.1"),
  soccer("ucl", "UCL", "UEFA Champions League", "uefa.champions", false, { carryover: 0.9 }),
  soccer("uel", "Europa", "UEFA Europa League", "uefa.europa", false, { carryover: 0.9 }),
  soccer("mls", "MLS", "Major League Soccer", "usa.1", true),
  soccer("ligamx", "Liga MX", "Mexican Liga MX", "mex.1", true),
  soccer("brasileirao", "Brasileirão", "Brazilian Série A", "bra.1", true),
  soccer("argentina", "Argentina", "Argentine Liga Profesional", "arg.1", true),
  soccer("eredivisie", "Eredivisie", "Dutch Eredivisie", "ned.1"),
  soccer("primeira", "Primeira", "Portuguese Primeira Liga", "por.1"),
  soccer("championship", "EFL Champ.", "English Championship", "eng.2"),
  soccer("superlig", "Süper Lig", "Turkish Süper Lig", "tur.1"),
  soccer("spfl", "SPFL", "Scottish Premiership", "sco.1"),
  soccer("belgium", "Belgium", "Belgian Pro League", "bel.1"),
  soccer("saudi", "Saudi", "Saudi Pro League", "ksa.1"),
  soccer("jleague", "J-League", "Japanese J1 League", "jpn.1", true),
  soccer("aleague", "A-League", "Australian A-League", "aus.1"),
  soccer("libertadores", "Libertadores", "Copa Libertadores", "conmebol.libertadores", true, { carryover: 0.9 }),
  soccer("nwsl", "NWSL", "NWSL (women)", "usa.nwsl", true),
  {
    key: "atp", label: "ATP", name: "ATP Tour (men)", group: "Tennis", kind: "athlete",
    espnPath: "tennis/atp", coreLeaguePath: "tennis/leagues/atp", ingest: "range", draws: false, hasSpread: false, hasTotal: false,
    k: 32, homeAdv: 0, eloPerPoint: 1, marginSigma: 1, totalSigma: 1, carryover: 0.9, movMultiplier: false, marketWeight: 0,
    seasons: [2025, 2026], avgPoints: 0, propStatMap: NONE,
  },
  {
    key: "wta", label: "WTA", name: "WTA Tour (women)", group: "Tennis", kind: "athlete",
    espnPath: "tennis/wta", coreLeaguePath: "tennis/leagues/wta", ingest: "range", draws: false, hasSpread: false, hasTotal: false,
    k: 32, homeAdv: 0, eloPerPoint: 1, marginSigma: 1, totalSigma: 1, carryover: 0.9, movMultiplier: false, marketWeight: 0,
    seasons: [2025, 2026], avgPoints: 0, propStatMap: NONE,
  },
  {
    key: "ufc", label: "UFC", name: "UFC / MMA", group: "MMA", kind: "athlete",
    espnPath: "mma/ufc", coreLeaguePath: "mma/leagues/ufc", ingest: "range", draws: false, hasSpread: false, hasTotal: false,
    k: 40, homeAdv: 0, eloPerPoint: 1, marginSigma: 1, totalSigma: 1, carryover: 0.95, movMultiplier: false, marketWeight: 0.85,
    seasons: [2024, 2025, 2026], avgPoints: 0, propStatMap: NONE,
  },
];

export const SPORTS: Record<string, SportConfig> = Object.fromEntries(LIST.map((s) => [s.key, s]));
export const SPORT_KEYS: string[] = LIST.map((s) => s.key);
export type SportKey = string;

export const GROUPS: SportGroup[] = ["Football", "Basketball", "Baseball", "Hockey", "Soccer", "Tennis", "MMA"];

/** Leagues scanned by the Edge Finder by default. */
export const FEATURED_KEYS = ["nfl", "nba", "mlb", "nhl", "ncaaf", "wnba", "epl", "laliga", "bundesliga", "seriea", "ligue1", "ucl", "mls", "ufc"];

export function isSportKey(s: string): s is SportKey {
  return Object.prototype.hasOwnProperty.call(SPORTS, s);
}

export function currentSeason(sport: SportKey): number {
  const c = SPORTS[sport];
  return c.seasons[c.seasons.length - 1];
}

export function leaguesByGroup(): { group: SportGroup; leagues: SportConfig[] }[] {
  return GROUPS.map((g) => ({ group: g, leagues: LIST.filter((s) => s.group === g) }));
}
