"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Header } from "./header";
import { SportTabs } from "./sport-tabs";
import { EdgeBadge, ConfidencePill } from "./edge-badge";
import { PickButton } from "./pick-button";
import { CardSkeletons, EmptyState } from "./empty";
import { pct, kickoff } from "@/lib/format";
import type { PropLine } from "@/types";
import { cn } from "@/lib/utils";

interface GameOpt { id: string; label: string; date: string; home: { abbr: string }; away: { abbr: string } }

export function PropsExplorer() {
  const sp = useSearchParams();
  const [sport, setSport] = useState(sp.get("sport") || "nfl");
  const [games, setGames] = useState<GameOpt[] | null>(null);
  const [gameId, setGameId] = useState<string | null>(sp.get("id"));
  const [props, setProps] = useState<PropLine[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"line" | "milestone">("line");
  const [stat, setStat] = useState("all");

  useEffect(() => {
    setGames(null); setProps(null); setErr(null);
    fetch(`/api/props?sport=${sport}`).then((r) => r.json()).then((j) => {
      setGames(j.games || []);
      if (!j.games?.some((g: GameOpt) => g.id === gameId)) setGameId(j.games?.[0]?.id ?? null);
    }).catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  useEffect(() => {
    if (!gameId) return;
    setLoading(true); setProps(null); setErr(null);
    fetch(`/api/props?sport=${sport}&id=${gameId}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setProps(j.props);
    }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [sport, gameId]);

  const stats = useMemo(() => ["all", ...new Set((props || []).filter((p) => p.kind === kind).map((p) => p.statKey))], [props, kind]);
  const shown = useMemo(() => (props || [])
    .filter((p) => p.kind === kind)
    .filter((p) => stat === "all" || p.statKey === stat)
    .filter((p) => !q || p.athleteName.toLowerCase().includes(q.toLowerCase()) || (p.team || "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (kind === "line" ? b.edge - a.edge : b.overProb - a.overProb)), [props, kind, stat, q]);
  const game = games?.find((g) => g.id === gameId);

  return (
    <main>
      <Header title="Player Props" subtitle="Projected distributions vs. posted lines" />
      <SportTabs value={sport} onChange={(s) => { setSport(s); setGameId(null); }} />
      {games && games.length === 0 && <EmptyState title="No upcoming games with props" body="Props post 1–2 days before kickoff." />}
      {games && games.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-3">
          {games.map((g) => (
            <button key={g.id} onClick={() => setGameId(g.id)} className={cn("shrink-0 rounded-xl px-3 py-2 text-left border", gameId === g.id ? "border-primary bg-primary/10" : "border-border bg-secondary/50")}>
              <div className="font-display font-bold text-sm">{g.away.abbr} @ {g.home.abbr}</div>
              <div className="text-[10px] text-muted-foreground">{kickoff(g.date)}</div>
            </button>
          ))}
        </div>
      )}
      {game && (
        <div className="px-4 space-y-2">
          <div className="flex items-center gap-2 glass rounded-xl px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search player or team" className="bg-transparent py-2.5 text-sm flex-1 outline-none" />
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => { setKind("line"); setStat("all"); }} className={cn("rounded-full px-3 py-1 font-bold border", kind === "line" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground")}>Over/Under</button>
            <button onClick={() => { setKind("milestone"); setStat("all"); }} className={cn("rounded-full px-3 py-1 font-bold border", kind === "milestone" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground")}>Milestones</button>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {stats.map((s) => (
              <button key={s} onClick={() => setStat(s)} className={cn("shrink-0 rounded-full px-3 py-1 text-xs border", stat === s ? "bg-primary/15 text-primary border-primary/40" : "border-border text-muted-foreground")}>{s === "all" ? "All stats" : (props?.find((p) => p.statKey === s)?.label.replace(/ \d+\+$/, "") ?? s)}</button>
            ))}
          </div>
        </div>
      )}
      {loading && <div className="pt-3"><CardSkeletons n={5} /></div>}
      {err && <EmptyState title="Props unavailable" body={err} />}
      {props && shown.length === 0 && !loading && <div className="pt-3"><EmptyState title="No props match" body="Try another filter or game." /></div>}
      <div className="px-4 pt-3 space-y-2">{shown.slice(0, 120).map((p) => <PropCard key={p.id} p={p} game={game} />)}</div>
      {props && <p className="px-6 pt-4 text-[11px] text-muted-foreground text-center">Lines: DraftKings via ESPN. Over/Under edges assume −110 both sides; milestones show hit probability only. Projections use the player&apos;s last two seasons with recency weighting, shrunk toward the market line.</p>}
    </main>
  );
}

function PropCard({ p, game }: { p: PropLine; game?: GameOpt }) {
  const prob = p.kind === "milestone" ? p.overProb : Math.max(p.overProb, p.underProb);
  const spark = p.projection.recent;
  const maxV = Math.max(p.line, ...spark, 1);
  return (
    <div className="glass rounded-2xl p-3">
      <div className="flex items-center gap-3">
        {p.headshot ? <Image src={p.headshot} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover bg-secondary" unoptimized /> : <div className="h-10 w-10 rounded-full bg-secondary" />}
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold leading-tight truncate">{p.athleteName}</div>
          <div className="text-[11px] text-muted-foreground">{p.team} {p.position} · {p.label}{p.kind === "line" ? ` ${p.line}` : ""}</div>
        </div>
        <div className="text-right">
          <div className="font-mono font-bold text-lg num leading-none">{p.kind === "line" ? <span className={p.pick === "over" ? "text-profit" : "text-pend"}>{p.pick === "over" ? "OVER" : "UNDER"}</span> : <span>{pct(prob)}</span>}</div>
          <div className="text-[11px] text-muted-foreground">{p.kind === "line" ? `${pct(prob)} · proj ${p.projection.mean.toFixed(1)}` : `proj ${p.projection.mean.toFixed(1)} ± ${p.projection.sd.toFixed(1)}`}</div>
        </div>
      </div>
      <div className="mt-2 flex items-end gap-1 h-8">
        {spark.map((v, i) => <div key={i} className={cn("flex-1 rounded-sm", v > p.line ? "bg-profit/70" : "bg-secondary")} style={{ height: `${Math.max(8, (v / maxV) * 100)}%` }} title={String(v)} />)}
        <div className="ml-2 text-[10px] text-muted-foreground font-mono num">last {spark.length}: {spark.join(" · ")}</div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ConfidencePill tier={p.confidence} />
          {p.kind === "line" && <EdgeBadge edge={p.edge} />}
          <span className="text-[10px] text-muted-foreground">n={p.projection.n}{p.openLine !== undefined && p.openLine !== p.line ? ` · opened ${p.openLine}` : ""}</span>
        </div>
        {p.kind === "line" && game && (
          <PickButton compact id={p.id} sport={p.sport} eventId={p.eventId} game={`${game.away.abbr} @ ${game.home.abbr}`} homeAbbr={game.home.abbr} date={game.date} market="prop" side={`${p.athleteName} ${p.pick} ${p.line} ${p.label}`} line={p.line} price={-110} modelProb={prob} marketProb={0.5} />
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">{p.reason}</p>
    </div>
  );
}
