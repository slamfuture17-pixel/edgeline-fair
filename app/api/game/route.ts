import { NextResponse } from "next/server";
import { gameById } from "@/lib/predict";
import { injuries } from "@/lib/espn";
import { isSportKey } from "@/lib/sports";
import { randn, normCdf } from "@/lib/math";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") || "nfl";
  const id = searchParams.get("id") || "";
  if (!isSportKey(sport) || !id) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const game = await gameById(sport, id);
  if (!game) return NextResponse.json({ error: "not found" }, { status: 404 });
  const inj = await injuries(sport, id).catch(() => []);

  const N = 10000;
  const { expectedMargin, expectedTotal, marginSigma, totalSigma } = game.model;
  let homeWins = 0;
  const marginHist = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    const m = expectedMargin + randn() * marginSigma;
    if (m > 0) homeWins++;
    const bucket = Math.max(-30, Math.min(30, Math.round(m / 3) * 3));
    marginHist.set(bucket, (marginHist.get(bucket) || 0) + 1);
  }
  const altSpreads = [-10.5, -7.5, -6.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 6.5, 7.5, 10.5].map((s) => ({ line: s, homeCover: 1 - normCdf((-s - expectedMargin) / marginSigma) }));
  const base = game.market?.total ?? expectedTotal;
  const altTotals = [-6, -4, -2, 0, 2, 4, 6].map((d) => {
    const t = Math.round((base + d) * 2) / 2;
    return { line: t, over: 1 - normCdf((t - expectedTotal) / totalSigma) };
  });
  const histogram = [...marginHist.entries()].sort((a, b) => a[0] - b[0]).map(([bucket, n]) => ({ bucket, pct: n / N }));
  return NextResponse.json({
    game,
    injuries: inj,
    sim: { n: N, homeWinProb: homeWins / N, projHome: (expectedTotal + expectedMargin) / 2, projAway: (expectedTotal - expectedMargin) / 2, histogram, altSpreads, altTotals },
  });
}
