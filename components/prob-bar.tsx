import { cn } from "@/lib/utils";

/** Two-sided probability bar: left = away, right = home. Optional draw band for soccer. */
export function ProbBar({ homeProb, drawProb, marketHome, homeAbbr, awayAbbr }: { homeProb: number; drawProb?: number; marketHome?: number; homeAbbr: string; awayAbbr: string }) {
  const h = Math.round(homeProb * 100);
  const d = drawProb !== undefined ? Math.round(drawProb * 100) : 0;
  const a = 100 - h - d;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] font-mono num">
        <span className={cn(a > h ? "text-primary font-bold" : "text-muted-foreground")}>{awayAbbr} {a}%</span>
        {drawProb !== undefined && <span className="text-muted-foreground">draw {d}%</span>}
        <span className={cn(h >= a ? "text-primary font-bold" : "text-muted-foreground")}>{homeAbbr} {h}%</span>
      </div>
      <div className="relative h-2 rounded-full bg-secondary overflow-hidden flex">
        <div className="h-full bg-pend/70" style={{ width: `${a}%` }} />
        {drawProb !== undefined && <div className="h-full bg-muted-foreground/40" style={{ width: `${d}%` }} />}
        <div className="h-full bg-primary/80" style={{ width: `${h}%` }} />
        {marketHome !== undefined && <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${100 - marketHome * 100}%` }} title="market" />}
      </div>
      {marketHome !== undefined && <div className="text-[10px] text-muted-foreground">| = market fair line ({Math.round(marketHome * 100)}% {homeAbbr})</div>}
    </div>
  );
}
