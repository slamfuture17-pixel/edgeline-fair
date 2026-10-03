import type { SportKey } from "@/lib/sports";

export interface TeamRef {
  id: string;
  abbr: string;
  name: string;
  logo?: string;
  color?: string;
  record?: string;
  rank?: number;
}

export interface GameResult {
  id: string;
  eventId?: string;
  sport: SportKey;
  season: number;
  seasonType: number;
  date: string;
  home: TeamRef;
  away: TeamRef;
  homeScore: number;
  awayScore: number;
  final: boolean;
}

export interface MarketLines {
  provider: string;
  homeML?: number;
  awayML?: number;
  drawML?: number;
  spreadHome?: number;
  spreadHomeOdds?: number;
  spreadAwayOdds?: number;
  total?: number;
  overOdds?: number;
  underOdds?: number;
  openSpreadHome?: number;
  openTotal?: number;
  openHomeML?: number;
  openAwayML?: number;
  closeHomeML?: number;
  closeAwayML?: number;
  closeDrawML?: number;
  closeSpreadHome?: number;
  closeTotal?: number;
  updated?: string;
}

export interface SideEdge {
  side: string;
  modelProb: number;
  marketProb: number;
  price: number;
  edge: number;
  ev: number;
  kelly: number;
}

export interface MarketPrediction {
  market: "moneyline" | "spread" | "total";
  line?: number;
  sides: SideEdge[];
  best?: SideEdge;
}

export interface Factor {
  label: string;
  value: string;
  impact: number;
  explanation: string;
}

export interface GamePrediction {
  id: string;
  sport: SportKey;
  league: string;
  kind: "team" | "athlete";
  date: string;
  status: "scheduled" | "live" | "final";
  statusDetail: string;
  seasonType?: number;
  eventName?: string;
  round?: string;
  home: TeamRef;
  away: TeamRef;
  homeScore?: number;
  awayScore?: number;
  elo: { home: number; away: number; homeWinProb: number; expectedMargin: number };
  rest: { home: number | null; away: number | null };
  form: { homePF: number; homePA: number; awayPF: number; awayPA: number; games: number };
  model: {
    homeWinProb: number;
    drawProb?: number;
    awayWinProb: number;
    expectedMargin: number;
    expectedTotal: number;
    marginSigma: number;
    totalSigma: number;
    marketWeight: number;
  };
  market?: MarketLines;
  marketFair?: { homeWinProb: number; drawProb?: number; vig: number };
  predictions: MarketPrediction[];
  topEdge?: SideEdge & { market: string };
  confidence: "A" | "B" | "C";
  factors: Factor[];
  venue?: string;
  broadcast?: string;
  modelOnly?: boolean;
}

export interface PropLine {
  id: string;
  sport: SportKey;
  eventId: string;
  athleteId: string;
  athleteName: string;
  position?: string;
  team?: string;
  headshot?: string;
  typeName: string;
  label: string;
  statKey: string;
  kind: "line" | "milestone";
  line: number;
  openLine?: number;
  provider: string;
  projection: { mean: number; sd: number; median: number; dist: "normal" | "count"; n: number; recent: number[]; season: number };
  overProb: number;
  underProb: number;
  pick: "over" | "under";
  edge: number;
  ev: number;
  confidence: "A" | "B" | "C";
  reason: string;
}

export interface LoggedPrediction {
  id: string;
  sport: SportKey;
  eventId: string;
  gameLabel: string;
  date: string;
  market: string;
  side: string;
  line?: number;
  price: number;
  modelProb: number;
  marketProb: number;
  createdAt: string;
  settledAt?: string;
  result?: "win" | "loss" | "push";
  closingPrice?: number;
  closingProb?: number;
  clv?: number;
}

export interface BacktestSummary {
  sport: SportKey;
  seasons: number[];
  games: number;
  gamesWithMarket: number;
  elo: { brier: number; logLoss: number; accuracy: number };
  market: { brier: number; logLoss: number; accuracy: number } | null;
  blend: { brier: number; logLoss: number; accuracy: number } | null;
  calibration: { bucket: string; predicted: number; actual: number; n: number }[];
  edgeBets: { threshold: number; bets: number; wins: number; roi: number; clvAvg: number }[];
  generatedAt: string;
}
