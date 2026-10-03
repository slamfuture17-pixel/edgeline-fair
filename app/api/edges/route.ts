import { NextResponse } from "next/server";
import { slate } from "@/lib/predict";
import { FEATURED_KEYS, isSportKey } from "@/lib/sports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const requested = (searchParams.get("sports") || "").split(",").filter(isSportKey);
  const keys = requested.length ? requested : FEATURED_KEYS;
  const results = await Promise.all(keys.map((s) => slate(s, 2).catch(() => [])));
  const edges = results.flat().flatMap((g) =>
    g.status !== "scheduled" || !g.market
      ? []
      : g.predictions.flatMap((m) =>
          m.sides.map((s) => ({
            sport: g.sport,
            league: g.league,
            eventId: g.id,
            game: g.kind === "athlete" ? `${g.away.abbr} vs ${g.home.abbr}` : `${g.away.abbr} @ ${g.home.abbr}`,
            date: g.date,
            market: m.market,
            line: m.line,
            ...s,
            confidence: g.confidence,
          })),
        ),
  );
  edges.sort((a, b) => b.ev - a.ev);
  return NextResponse.json({ generatedAt: new Date().toISOString(), edges });
}
