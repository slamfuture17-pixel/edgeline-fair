"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import type { GamePrediction } from "@/types";
import { EdgeBadge, ConfidencePill } from "./edge-badge";
import { ProbBar } from "./prob-bar";
import { kickoff, spread, price } from "@/lib/format";
import { useSettings } from "./settings-provider";

export function TeamRow({ abbr, name, logo, record, score, right }: { abbr: string; name: string; logo?: string; record?: string; score?: number; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {logo ? <Image src={logo} alt={abbr} width={28} height={28} className="h-7 w-7 object-contain" unoptimized /> : <div className="h-7 w-7 rounded-full bg-secondary" />}
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold leading-tight">{name}</div>
        <div className="text-[11px] text-muted-foreground">{record}</div>
      </div>
      {score !== undefined && <div className="font-mono text-xl font-bold num">{score}</div>}
      {right}
    </div>
  );
}

export function GameCard({ g, index = 0 }: { g: GamePrediction; index?: number }) {
  const { settings } = useSettings();
  const top = g.topEdge;
  const mkt = g.market;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }}>
      <Link href={`/game/${g.sport}/${g.id}`} className="block glass rounded-2xl p-4 active:scale-[0.99] transition-transform">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-display">
            {g.status === "live" ? <span className="text-loss animate-pulseglow font-bold">● LIVE {g.statusDetail}</span> : g.status === "final" ? `Final` : kickoff(g.date)}
            {g.seasonType === 1 && <span className="ml-2 rounded bg-warn/15 px-1.5 py-0.5 text-warn">Preseason</span>}
          </span>
          <div className="flex items-center gap-2">
            <ConfidencePill tier={g.confidence} />
            {top && g.status === "scheduled" && <EdgeBadge edge={top.edge} />}
          </div>
        </div>
        <div className="space-y-2">
          <TeamRow {...g.away} score={g.awayScore} />
          <TeamRow {...g.home} score={g.homeScore} />
        </div>
        <div className="mt-3"><ProbBar homeProb={g.model.homeWinProb} marketHome={g.marketFair?.homeWinProb} homeAbbr={g.home.abbr} awayAbbr={g.away.abbr} /></div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="text-muted-foreground font-mono num">
            {mkt?.spreadHome !== undefined ? `${g.home.abbr} ${spread(mkt.spreadHome)}` : "No line"}
            {mkt?.total !== undefined && ` · O/U ${mkt.total}`}
          </div>
          {top && g.status === "scheduled" && (
            <div className="font-display font-bold"><span className="text-primary">{top.side}</span> <span className="text-muted-foreground font-mono">{price(top.price, settings.oddsFormat)}</span></div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
