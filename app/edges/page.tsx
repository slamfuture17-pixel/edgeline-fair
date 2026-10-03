"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { EdgeBadge, ConfidencePill } from "@/components/edge-badge";
import { PickButton } from "@/components/pick-button";
import { CardSkeletons, EmptyState } from "@/components/empty";
import { useSettings } from "@/components/settings-provider";
import { kickoff, pct, price, signedPct } from "@/lib/format";
import { GROUPS, SPORTS, FEATURED_KEYS, type SportGroup } from "@/lib/sports";
import { cn } from "@/lib/utils";
import type { SideEdge } from "@/types";

interface Edge extends SideEdge { sport: string; league: string; eventId: string; game: string; date: string; market: string; line?: number; confidence: "A" | "B" | "C" }

export default function EdgesPage() {
  const [group, setGroup] = useState<SportGroup | "all">("all");
  const [edges, setEdges] = useState<Edge[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { settings, update } = useSettings();

  useEffect(() => {
    fetch("/api/edges").then((r) => r.json()).then((j) => setEdges(j.edges)).catch((e) => setErr(e.message));
  }, []);

  const shown = useMemo(() => (edges || [])
    .filter((e) => group === "all" || SPORTS[e.sport]?.group === group)
    .filter((e) => e.edge >= settings.minEdge && e.ev > 0)
    .filter((e) => e.price >= -400 && e.price <= 400), [edges, group, settings.minEdge]);

  const scanned = FEATURED_KEYS.map((k) => SPORTS[k]?.label).filter(Boolean).join(", ");

  return (
    <main>
      <Header title="Edge Finder" subtitle="Ranked by expected value vs. de-vigged price" />
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3">
        {(["all", ...GROUPS] as const).filter((g) => g === "all" || g !== "Tennis").map((g) => (
          <button key={g} onClick={() => setGroup(g)} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-display font-bold border", group === g ? "bg-primary text-primary-foreground border-primary shadow-profit" : "bg-secondary/60 text-muted-foreground border-border")}>{g === "all" ? "All" : g}</button>
        ))}
      </div>
      <div className="px-4 pb-3 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Min edge</span>
        <div className="flex gap-1">
          {[0.01, 0.02, 0.03, 0.05].map((m) => (
            <button key={m} onClick={() => update({ minEdge: m })} className={`rounded-full px-3 py-1 border font-mono ${settings.minEdge === m ? "bg-primary/15 text-primary border-primary/40" : "border-border text-muted-foreground"}`}>{Math.round(m * 100)}%</button>
          ))}
        </div>
      </div>
      {err && <EmptyState title="Couldn't load edges" body={err} />}
      {!edges && !err && <><p className="px-6 pb-2 text-[11px] text-muted-foreground text-center">Scanning {FEATURED_KEYS.length} leagues… first scan of the day can take a minute.</p><CardSkeletons n={5} /></>}
      {edges && shown.length === 0 && <EmptyState title="No edges above your threshold" body="Lower the minimum edge or check back closer to game time." />}
      <div className="px-4 space-y-2">
        {shown.slice(0, 80).map((e, i) => {
          const stake = Math.round(settings.bankroll * settings.kellyFraction * e.kelly);
          return (
            <div key={`${e.sport}-${e.eventId}-${e.market}-${e.side}`} className="glass rounded-2xl p-3 animate-rise-in" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <div className="flex items-center justify-between">
                <Link href={`/game/${e.sport}/${e.eventId}`} className="min-w-0">
                  <div className="font-display font-bold truncate"><span className="text-primary">{e.side}</span> <span className="text-muted-foreground font-mono text-xs">{price(e.price, settings.oddsFormat)}</span></div>
                  <div className="text-[11px] text-muted-foreground truncate">{e.league} · {e.game} · {kickoff(e.date)} · {e.market}</div>
                </Link>
                <div className="text-right shrink-0">
                  <EdgeBadge edge={e.edge} />
                  <div className="text-[10px] text-muted-foreground mt-1">EV {signedPct(e.ev)}</div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono num">
                  <ConfidencePill tier={e.confidence} />
                  model {pct(e.modelProb, 1)} · mkt {pct(e.marketProb, 1)} · stake ${stake}
                </div>
                <PickButton compact id={`${e.sport}:${e.eventId}:${e.market}:${e.side}`} sport={e.sport} eventId={e.eventId} game={e.game} homeAbbr={e.game.split(" @ ")[1] ?? ""} date={e.date} market={e.market} side={e.side} line={e.line} price={e.price} modelProb={e.modelProb} marketProb={e.marketProb} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="px-6 pt-5 text-[11px] text-muted-foreground text-center">Scans: {scanned}. Stake = bankroll × {Math.round(settings.kellyFraction * 100)}% Kelly. Tennis is excluded (no price feed). Edges are small by design — the Record tab shows how our disagreements have fared.</p>
    </main>
  );
}
