import { NextResponse } from "next/server";
import { readBacktest } from "@/lib/backtest";
import { readLedger, summarise } from "@/lib/store";
import { SPORT_KEYS } from "@/lib/sports";

export const dynamic = "force-dynamic";

export async function GET() {
  const backtests = Object.fromEntries(await Promise.all(SPORT_KEYS.map(async (s) => [s, await readBacktest(s)])));
  const ledger = await readLedger();
  const bySport = Object.fromEntries(SPORT_KEYS.map((s) => [s, summarise(ledger.filter((r) => r.sport === s))]));
  return NextResponse.json({ backtests, live: { all: summarise(ledger), bySport, recent: ledger.filter((r) => r.result).slice(-40).reverse() } });
}
