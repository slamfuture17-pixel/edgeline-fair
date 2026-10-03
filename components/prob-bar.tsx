import { cn } from "@/lib/utils";

export function ProbBar({ homeProb, marketHome, homeAbbr, awayAbbr }: { homeProb: number; marketHome?: number; homeAbbr: string; awayAbbr: string }) {
  const h = Math.round(homeProb * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] font-mono num">
        <span className={cn(h < 50 ? "text-primary font-bold" : "text-muted-foreground")}>{awayAbbr} {100 - h}%</span>
        <span className={cn(h >= 50 ? "text-primary font-bold" : "text-muted-foreground")}>{homeAbbr} {h}%</span>
      </div>
      <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
        <div className="absolute inset-y-0 right-0 bg-primary/80" style={{ width: `${h}%` }} />
        {marketHome !== undefined && <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${100 - marketHome * 100}%` }} title="market" />}
      </div>
      {marketHome !== undefined && <div className="text-[10px] text-muted-foreground">| = market fair line ({Math.round(marketHome * 100)}% {homeAbbr})</div>}
    </div>
  );
}
