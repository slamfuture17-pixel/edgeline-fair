import { NextResponse } from "next/server";
import { propsForGame } from "@/lib/props";
import { upcoming } from "@/lib/espn";
import { isSportKey } from "@/lib/sports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") || "nfl";
  const id = searchParams.get("id");
  if (!isSportKey(sport)) return NextResponse.json({ error: "unknown sport" }, { status: 400 });
  const games = await upcoming(sport, 3);
  const list = games.filter((g) => g.status === "scheduled").map((g) => ({ id: g.id, label: g.shortName, date: g.date, home: g.home, away: g.away }));
  if (!id) return NextResponse.json({ games: list });
  const game = games.find((g) => g.id === id);
  if (!game) return NextResponse.json({ error: "game not found" }, { status: 404 });
  try {
    const props = await propsForGame(sport, game);
    return NextResponse.json({ game: { id: game.id, label: game.shortName, date: game.date }, props, generatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
