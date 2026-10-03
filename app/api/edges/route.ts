import { NextResponse } from "next/server";
import { slate } from "@/lib/predict";
import { SPORT_KEYS } from "@/lib/sports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const results = await Promise.all(SPORT_KEYS.map((s) => slate(s, 2).catch(() => [])));
  const edges = results.flat().flatMap((g) =>
    g.status !== "scheduled" || !g.market
      ? []
      : g.predictions.flatMap((m) =>
          m.sides.map((s) => ({ sport: g.sport, eventId: g.id, game: `${g.away.abbr} @ ${g.home.abbr}`, date: g.date, market: m.market, line: m.line, ...s, confidence: g.confidence })),
        ),
  );
  edges.sort((a, b) => b.ev - a.ev);
  return NextResponse.json({ generatedAt: new Date().toISOString(), edges });
}
