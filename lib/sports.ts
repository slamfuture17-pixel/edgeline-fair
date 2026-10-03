// Sport registry: ESPN paths + model hyperparameters (re-checked by scripts/backtest.ts).

export type SportKey = "nfl" | "nba" | "mlb" | "nhl";

export interface SportConfig {
  key: SportKey;
  label: string;
  espnPath: string;
  coreLeaguePath: string;
  k: number;
  homeAdv: number;
  eloPerPoint: number;
  marginSigma: number;
  totalSigma: number;
  carryover: number;
  movMultiplier: boolean;
  seasonsForElo: number[];
  propStatMap: Record<string, { statKey: string; dist: "normal" | "count"; label: string }>;
}

const THIS_SEASON = {
  nfl: 2026,
  nba: 2027, // ESPN labels the 2026-27 NBA season as 2027
  mlb: 2026,
  nhl: 2027,
};

export const SPORTS: Record<SportKey, SportConfig> = {
  nfl: {
    key: "nfl", label: "NFL", espnPath: "football/nfl", coreLeaguePath: "football/leagues/nfl",
    k: 20, homeAdv: 48, eloPerPoint: 25, marginSigma: 13.4, totalSigma: 10.2, carryover: 0.67, movMultiplier: true,
    seasonsForElo: [THIS_SEASON.nfl - 2, THIS_SEASON.nfl - 1, THIS_SEASON.nfl],
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
  nba: {
    key: "nba", label: "NBA", espnPath: "basketball/nba", coreLeaguePath: "basketball/leagues/nba",
    k: 20, homeAdv: 70, eloPerPoint: 28, marginSigma: 12.3, totalSigma: 18.5, carryover: 0.75, movMultiplier: true,
    seasonsForElo: [THIS_SEASON.nba - 2, THIS_SEASON.nba - 1, THIS_SEASON.nba],
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
  mlb: {
    key: "mlb", label: "MLB", espnPath: "baseball/mlb", coreLeaguePath: "baseball/leagues/mlb",
    k: 4, homeAdv: 24, eloPerPoint: 95, marginSigma: 3.05, totalSigma: 3.4, carryover: 0.7, movMultiplier: false,
    seasonsForElo: [THIS_SEASON.mlb - 1, THIS_SEASON.mlb],
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
  nhl: {
    key: "nhl", label: "NHL", espnPath: "hockey/nhl", coreLeaguePath: "hockey/leagues/nhl",
    k: 6, homeAdv: 33, eloPerPoint: 150, marginSigma: 2.25, totalSigma: 2.3, carryover: 0.7, movMultiplier: false,
    seasonsForElo: [THIS_SEASON.nhl - 1, THIS_SEASON.nhl],
    propStatMap: {
      "Total Shots on Goal": { statKey: "shotsTotal", dist: "count", label: "Shots" },
      "Total Points": { statKey: "points", dist: "count", label: "Points" },
      "Total Assists": { statKey: "assists", dist: "count", label: "Assists" },
      "Total Goals": { statKey: "goals", dist: "count", label: "Goals" },
      "Total Saves": { statKey: "saves", dist: "normal", label: "Saves" },
    },
  },
};

export const SPORT_KEYS: SportKey[] = ["nfl", "nba", "mlb", "nhl"];

export function isSportKey(s: string): s is SportKey {
  return (SPORT_KEYS as string[]).includes(s);
}

export function currentSeason(sport: SportKey): number {
  return THIS_SEASON[sport];
}
