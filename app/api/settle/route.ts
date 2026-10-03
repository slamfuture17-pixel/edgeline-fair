import { NextResponse } from "next/server";
import { scoreboard, eventOdds } from "@/lib/espn";
import { isSportKey } from "@/lib/sports";
import { fairTwoWay } from "@/lib/odds";

export const dynamic = "force-dynamic";

interface PickIn { id: string; sport: string; eventId: string; date: string; market: string; side: string; line?: number; price: number; marketProb?: number; homeAbbr: string }

/** Grade user picks against real final scores + closing lines. */
export async function POST(req: Request) {
  const picks = (await req.json()) as PickIn[];
  const out: Record<string, { result?: "win" | "loss" | "push"; homeScore?: number; awayScore?: number; clv?: number; closingPrice?: number }> = {};
  for (const p of picks) {
    if (!isSportKey(p.sport)) continue;
    const day = p.date.slice(0, 10).replace(/-/g, "");
    const games = await scoreboard(p.sport, p.sport === "nfl" || p.sport === "ncaaf" ? undefined : day).catch(() => []);
    const g = games.find((x) => x.id === p.eventId);
    if (!g || g.status !== "final" || g.homeScore === undefined || g.awayScore === undefined) continue;
    const margin = g.homeScore - g.awayScore, total = g.homeScore + g.awayScore;
    const isHome = p.side.startsWith(p.homeAbbr);
    let result: "win" | "loss" | "push" | undefined;
    if (p.market === "moneyline") result = p.side === "Draw" ? (margin === 0 ? "win" : "loss") : margin === 0 ? (p.side.endsWith(" win") ? "loss" : "push") : (margin > 0) === isHome ? "win" : "loss";
    else if (p.market === "spread" && p.line !== undefined) { const adj = isHome ? margin + p.line : -margin - p.line; result = adj > 0 ? "win" : adj < 0 ? "loss" : "push"; }
    else if (p.market === "total" && p.line !== undefined) result = total === p.line ? "push" : (total > p.line) === p.side.startsWith("Over") ? "win" : "loss";
    const entry: (typeof out)[string] = { result, homeScore: g.homeScore, awayScore: g.awayScore };
    if (p.market === "moneyline" && p.marketProb !== undefined) {
      const o = await eventOdds(p.sport, p.eventId, true).catch(() => undefined);
      if (o?.closeHomeML !== undefined && o.closeAwayML !== undefined) {
        const [pH] = fairTwoWay(o.closeHomeML, o.closeAwayML);
        entry.clv = (isHome ? pH : 1 - pH) - p.marketProb;
        entry.closingPrice = isHome ? o.closeHomeML : o.closeAwayML;
      }
    }
    out[p.id] = entry;
  }
  return NextResponse.json(out);
}
