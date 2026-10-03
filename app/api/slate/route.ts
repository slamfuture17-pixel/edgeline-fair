import { NextResponse } from "next/server";
import { slate } from "@/lib/predict";
import { isSportKey } from "@/lib/sports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") || "nfl";
  if (!isSportKey(sport)) return NextResponse.json({ error: "unknown sport" }, { status: 400 });
  const days = Number(searchParams.get("days") || 3);
  try {
    const games = await slate(sport, days);
    return NextResponse.json({ sport, generatedAt: new Date().toISOString(), games });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
