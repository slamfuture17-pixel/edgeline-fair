// Player-prop engine: distribution-based projections from real game logs, shrunk toward the market line.
import { SPORTS, SportKey, currentSeason } from "./sports";
import { eventProps, roster, gameLog, GameLogRow, RosterPlayer, ScoreboardGame } from "./espn";
import { normCdf, negBinCdf, weightedMean, weightedVar, clamp } from "./math";
import { expectedValue } from "./odds";
import type { PropLine } from "@/types";

const HALF_LIFE_GAMES = 6;
const PRIOR_WEIGHT = 6;

interface Resolved { statKey: string; dist: "normal" | "count"; label: string; kind: "line" | "milestone" }

function resolveType(sport: SportKey, raw: string): Resolved | undefined {
  let name = raw.replace(/\s*\(incl\. overtime\)/i, "").trim();
  if (/1st|2nd|3rd|4th|half|quarter|first|last|anytime|scorer|team|to record|will there|moneyline|spread|^total$|run line/i.test(name)) return undefined;
  const kind: Resolved["kind"] = /milestones/i.test(name) ? "milestone" : "line";
  name = name.replace(/\s*milestones/i, "");
  const alias: Record<string, string> = {
    "Passing Yards": "Total Passing Yards", "Rushing Yards": "Total Rushing Yards", "Receiving Yards": "Total Receiving Yards",
    "Receptions": "Total Receptions", "Passing Touchdown": "Total Passing Touchdowns", "Passing Completions": "Total Passing Completions",
    "Total Pass Completions": "Total Passing Completions", "Passing Attempts": "Total Passing Attempts", "Rushing Attempts": "Total Rushing Attempts",
    "Total Carries": "Total Rushing Attempts", "Interceptions Thrown": "Total Interceptions", "Total Passing Interceptions": "Total Interceptions",
    "Rushing + Receiving Yards": "Total Rushing + Receiving Yards", "Total Rushing Plus Receiving Yards": "Total Rushing + Receiving Yards",
    "Passing + Rushing Yards": "Total Passing + Rushing Yards", "Total Passing Plus Rushing Yards": "Total Passing + Rushing Yards",
    "Points": "Total Points", "Rebounds": "Total Rebounds", "Assists": "Total Assists",
    "3-Point Field Goals Made": "Total 3-Point Field Goals Made", "Total Threes Made": "Total 3-Point Field Goals Made",
    "Points + Rebounds + Assists": "Total Points + Rebounds + Assists",
    "Hits": "Total Hits", "RBIs": "Total Runs Batted In", "Total RBIs": "Total Runs Batted In", "Home Runs": "Total Home Runs",
    "Runs": "Total Runs Scored", "Strikeouts Thrown": "Total Strikeouts", "Hits Allowed": "Total Hits Allowed", "Earned Runs Allowed": "Total Earned Runs Allowed",
    "Total Walks (Batter)": "Total Walks", "Walks (Batter)": "Total Walks", "Total Singles Hit": "Total Singles", "Total Doubles Hit": "Total Doubles", "Doubles": "Total Doubles",
    "Hits + Runs + RBIs": "Total Hits + Runs + RBIs",
    "Shots on Goal": "Total Shots on Goal", "Goals": "Total Goals", "Saves": "Total Saves",
  };
  const canon = alias[name] || name;
  const extra: Record<string, { statKey: string; dist: "normal" | "count"; label: string }> = {
    "Total Walks": { statKey: "walks", dist: "count", label: "Walks" },
    "Total Singles": { statKey: "singles", dist: "count", label: "Singles" },
    "Total Doubles": { statKey: "doubles", dist: "count", label: "Doubles" },
    "Total Hits + Runs + RBIs": { statKey: "hrr", dist: "count", label: "H+R+RBI" },
    "Total Outs Recorded": { statKey: "outs", dist: "normal", label: "Outs" },
  };
  const m = SPORTS[sport].propStatMap[canon] || extra[canon];
  if (!m) return undefined;
  return { ...m, kind };
}

function statValue(row: GameLogRow, key: string): number | undefined {
  const s = row.stats;
  const get = (k: string) => (s[k] !== undefined ? s[k] : undefined);
  switch (key) {
    case "rushRecYards": return (get("rushingYards") ?? 0) + (get("receivingYards") ?? 0);
    case "passRushYards": return (get("passingYards") ?? 0) + (get("rushingYards") ?? 0);
    case "pra": return (get("points") ?? 0) + (get("totalRebounds") ?? 0) + (get("assists") ?? 0);
    case "pr": return (get("points") ?? 0) + (get("totalRebounds") ?? 0);
    case "pa": return (get("points") ?? 0) + (get("assists") ?? 0);
    case "ra": return (get("totalRebounds") ?? 0) + (get("assists") ?? 0);
    case "totalBases": {
      const h = get("hits"), d = get("doubles") ?? 0, t = get("triples") ?? 0, hr = get("homeRuns") ?? 0;
      if (h === undefined) return undefined;
      return h - d - t - hr + 2 * d + 3 * t + 4 * hr;
    }
    case "singles": {
      const h = get("hits"); if (h === undefined) return undefined;
      return h - (get("doubles") ?? 0) - (get("triples") ?? 0) - (get("homeRuns") ?? 0);
    }
    case "hrr": return (get("hits") ?? 0) + (get("runs") ?? 0) + (get("RBIs") ?? 0);
    case "hitsAllowed": return get("hits");
    case "outs": { const ip = get("innings"); if (ip === undefined) return undefined; const whole = Math.floor(ip); return whole * 3 + Math.round((ip - whole) * 10); }
    default: return get(key);
  }
}

/** Exclude games where the player had no real role so distributions reflect a starter's workload. */
function usedInGame(sport: SportKey, row: GameLogRow, statKey: string): boolean {
  const s = row.stats;
  if (sport === "nfl") {
    if (/^pass|completions|interceptions/.test(statKey)) return (s.passingAttempts ?? 0) >= 10;
    if (/rush|rec|long/i.test(statKey)) return (s.rushingAttempts ?? 0) + (s.receivingTargets ?? 0) + (s.receptions ?? 0) >= 1;
    return true;
  }
  if (sport === "nba") return (s.minutes ?? 0) >= 8;
  if (sport === "mlb") {
    if (/strikeouts|earnedRuns|hitsAllowed|outs|walks/.test(statKey) && s.innings !== undefined) return (s.innings ?? 0) >= 1;
    return s.atBats === undefined || (s.atBats ?? 0) >= 1;
  }
  if (sport === "nhl") return statKey === "saves" ? true : (s.timeOnIcePerGame ?? 1) > 0;
  return true;
}

function project(values: number[], line: number, dist: "normal" | "count", priorWeight = PRIOR_WEIGHT) {
  const n = values.length;
  const ws = values.map((_, i) => Math.pow(0.5, (n - 1 - i) / HALF_LIFE_GAMES));
  const wSum = ws.reduce((a, b) => a + b, 0);
  const sampleMu = n ? weightedMean(values, ws) : line;
  const sampleVar = n > 1 ? weightedVar(values, ws, sampleMu) : NaN;
  const mu = (sampleMu * wSum + line * priorWeight) / (wSum + priorWeight);
  let sd: number;
  if (dist === "count") {
    sd = Math.sqrt(Math.max(isFinite(sampleVar) ? sampleVar : mu, mu * 1.05));
  } else {
    const floor = Math.max(0.35 * mu, 1);
    sd = Math.max(isFinite(sampleVar) ? Math.sqrt(sampleVar) : floor, floor * 0.8);
  }
  return { mu, sd, sampleMu, n, wSum };
}

function probOver(mu: number, sd: number, line: number, dist: "normal" | "count", kind: "line" | "milestone") {
  if (dist === "count") {
    const variance = sd * sd;
    const r = variance > mu ? (mu * mu) / (variance - mu) : Infinity;
    const k = kind === "milestone" ? line - 1 : Math.floor(line);
    return 1 - negBinCdf(k, mu, r);
  }
  const threshold = kind === "milestone" ? line - 0.5 : line;
  return 1 - normCdf((threshold - mu) / sd);
}

export async function propsForGame(sport: SportKey, game: ScoreboardGame): Promise<PropLine[]> {
  const [raw, rosterH, rosterA] = await Promise.all([
    eventProps(sport, game.id),
    roster(sport, game.home.id).catch(() => [] as RosterPlayer[]),
    roster(sport, game.away.id).catch(() => [] as RosterPlayer[]),
  ]);
  const players = new Map<string, RosterPlayer>();
  for (const p of [...rosterH, ...rosterA]) players.set(p.id, p);

  const wanted = raw
    .map((r) => ({ r, t: resolveType(sport, r.typeName) }))
    .filter((x): x is { r: typeof x.r; t: Resolved } => !!x.t && !!x.r.athleteId && x.r.target !== undefined);

  const athleteIds = [...new Set(wanted.map((w) => w.r.athleteId!))];
  const season = currentSeason(sport);
  const logs = new Map<string, GameLogRow[]>();
  const batch = 8;
  for (let i = 0; i < athleteIds.length; i += batch) {
    const chunk = athleteIds.slice(i, i + batch);
    const res = await Promise.all(
      chunk.map(async (id) => {
        const [cur, prev] = await Promise.all([gameLog(sport, id), gameLog(sport, id, season - 1).catch(() => [] as GameLogRow[])]);
        const seen = new Set<string>();
        const merged = [...prev, ...cur].filter((r) => (seen.has(r.eventId) ? false : (seen.add(r.eventId), true)));
        return [id, merged] as const;
      }),
    );
    for (const [id, rows] of res) logs.set(id, rows);
  }

  const out: PropLine[] = [];
  const projByKey = new Map<string, { mu: number; sd: number }>();
  const ordered = [...wanted].sort((a, b) => (a.t.kind === b.t.kind ? 0 : a.t.kind === "line" ? -1 : 1));
  for (const { r, t } of ordered) {
    const rows = logs.get(r.athleteId!) || [];
    const all = rows.filter((row) => usedInGame(sport, row, t.statKey)).map((row) => statValue(row, t.statKey)).filter((v): v is number => v !== undefined && isFinite(v));
    const values = all.slice(-30);
    const curSeasonVals = rows.filter((x) => x.date >= `${season - (sport === "nba" || sport === "nhl" ? 1 : 0)}-07-01`).map((row) => statValue(row, t.statKey)).filter((v): v is number => v !== undefined);
    const line = r.target!;
    const projKey = `${r.athleteId}:${t.statKey}`;
    let { mu, sd, sampleMu, n } = project(values, line, t.dist, t.kind === "line" ? PRIOR_WEIGHT : 0);
    if (t.kind === "line") projByKey.set(projKey, { mu, sd });
    else if (projByKey.has(projKey)) ({ mu, sd } = projByKey.get(projKey)!);
    const pOver = clamp(probOver(mu, sd, line, t.dist, t.kind), 0.01, 0.99);
    const pick: "over" | "under" = t.kind === "milestone" ? "over" : pOver >= 0.5 ? "over" : "under";
    const p = pick === "over" ? pOver : 1 - pOver;
    const edge = t.kind === "milestone" ? 0 : p - 0.5;
    const ev = t.kind === "milestone" ? 0 : expectedValue(p, -110);
    const player = players.get(r.athleteId!);
    const dataConf = n >= 12 ? 2 : n >= 6 ? 1 : 0;
    const confidence: PropLine["confidence"] = t.kind === "milestone" ? "C" : dataConf === 2 && edge > 0.06 ? "A" : dataConf >= 1 && edge > 0.03 ? "B" : "C";
    const recent = values.slice(-5);
    const hitRate = values.length ? values.filter((v) => (t.kind === "milestone" ? v >= line : v > line)).length / values.length : 0;
    const reason = n === 0
      ? "No game-log history found; projection defaults to the market line."
      : `Weighted avg ${sampleMu.toFixed(1)} over ${n} games (last 5: ${recent.join(", ")}); cleared ${line} in ${Math.round(hitRate * 100)}% of them. Projection ${mu.toFixed(1)} ± ${sd.toFixed(1)} after shrinking toward the line.`;
    out.push({
      id: `${sport}:${game.id}:${r.athleteId}:${t.statKey}:${t.kind}:${line}`,
      sport, eventId: game.id, athleteId: r.athleteId!,
      athleteName: player?.name || `Player ${r.athleteId}`, position: player?.position, team: player?.teamAbbr, headshot: player?.headshot,
      typeName: r.typeName, label: t.kind === "milestone" ? `${t.label} ${line}+` : t.label, statKey: t.statKey, kind: t.kind,
      line, openLine: r.openTarget, provider: "DraftKings",
      projection: { mean: mu, sd, median: mu, dist: t.dist, n, recent, season: curSeasonVals.length ? curSeasonVals.reduce((a, b) => a + b, 0) / curSeasonVals.length : sampleMu },
      overProb: pOver, underProb: 1 - pOver, pick, edge, ev, confidence, reason,
    });
  }
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).sort((a, b) => b.edge - a.edge);
}
