import { cn } from "@/lib/utils";
import { signedPct } from "@/lib/format";

export function EdgeBadge({ edge, className }: { edge: number; className?: string }) {
  const strong = edge >= 0.04;
  const pos = edge > 0.005;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono font-bold num", pos ? (strong ? "bg-profit/20 text-profit shadow-profit" : "bg-profit/10 text-profit") : "bg-loss/10 text-loss", className)}>
      {signedPct(edge)}
    </span>
  );
}

export function ConfidencePill({ tier }: { tier: "A" | "B" | "C" }) {
  const map = { A: "bg-primary text-primary-foreground", B: "bg-pend/20 text-pend", C: "bg-secondary text-muted-foreground" } as const;
  return <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-display font-bold", map[tier])}>{tier}</span>;
}
