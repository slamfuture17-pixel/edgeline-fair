"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { Header } from "./header";
import { TeamRow } from "./game-card";
import { ProbBar } from "./prob-bar";
import { EdgeBadge, ConfidencePill } from "./edge-badge";
import { PickButton } from "./pick-button";
import { CardSkeletons, EmptyState } from "./empty";
import { useSettings } from "./settings-provider";
import { kickoff, pct, price, spread, signedPct } from "@/lib/format";
import { SPORTS } from "@/lib/sports";
import type { GamePrediction } from "@/types";
import { cn } from "@/lib/utils";

interface Detail {
  game: GamePrediction;
  injuries: { team: string; player: string; position: string; status: string; detail?: string }[];
  sim: { n: number; homeWinProb: number; projHome: number; projAway: number; histogram: { bucket: number; pct: number }[]; altSpreads: { line: number; homeCover: number }[]; altTotals: { line: number; over: number }[] } | null;
}

export function GameDetail({ sport, id }: { sport: string; id: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { settings } = useSettings();
  useEffect(() => {
    fetch(`/api/game?sport=${sport}&id=${id}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setD(j);
    }).catch((e) => setErr(e.message));
  }, [sport, id]);

  if (err) return <main><Header title="Game" back="/" /><EmptyState title="Game not found" body={err} /></main>;
  if (!d) return <main><Header title="Loading…" back="/" /><CardSkeletons n={3} /></main>;
  const g = d.game;
  const cfg = SPORTS[g.sport];
  const athlete = g.kind === "athlete";
  const soccer = !!cfg?.draws;
  const label = athlete ? `${g.away.abbr} vs ${g.home.abbr}` : `${g.away.abbr} @ ${g.home.abbr}`;
  const hasProps = !athlete && Object.keys(cfg?.propStatMap ?? {}).length > 0;

  return (
    <main>
      <Header title={label} subtitle={`${cfg?.name ?? ""} · ${g.status === "final" ? "Final" : kickoff(g.date)}${g.eventName && athlete ? ` · ${g.eventName}` : g.venue ? ` · ${g.venue}` : ""}`} back="/" />
      <div className="px-4 pt-4 space-y-4">
        <section className="glass rounded-2xl p-4 space-y-3">
          <TeamRow {...g.away} score={g.awayScore} right={d.sim ? <span className="font-mono text-sm text-muted-foreground num">{d.sim.projAway.toFixed(soccer ? 2 : 1)}</span> : undefined} />
          <TeamRow {...g.home} score={g.homeScore} right={d.sim ? <span className="font-mono text-sm text-muted-foreground num">{d.sim.projHome.toFixed(soccer ? 2 : 1)}</span> : undefined} />
          {d.sim && <div className="text-[10px] text-muted-foreground text-right -mt-2">projected {soccer ? "goals" : "score"}</div>}
          <ProbBar homeProb={g.model.homeWinProb} drawProb={g.model.drawProb} marketHome={g.marketFair?.homeWinProb} homeAbbr={g.home.abbr} awayAbbr={g.away.abbr} />
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Rating only" value={pct(g.elo.homeWinProb)} sub={g.home.abbr} />
            <Stat label="Market fair" value={g.marketFair ? pct(g.marketFair.homeWinProb) : "—"} sub={g.marketFair ? `${g.marketFair.vig.toFixed(1)}% hold` : g.modelOnly ? "no feed" : "no line"} />
            <Stat label="Blend" value={pct(g.model.homeWinProb)} sub={`${Math.round(g.model.marketWeight * 100)}% market`} accent />
          </div>
          {g.modelOnly && <p className="text-[11px] text-warn">No bookmaker prices exist for this tour in our data source. Probabilities are pure model output; no edge or stake is shown.</p>}
        </section>

        {!g.modelOnly && (
          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-display px-1">Markets <span className="normal-case tracking-normal">· {g.market?.provider ?? "model only"}</span></h2>
            {g.predictions.map((m) => (
              <div key={m.market} className="glass rounded-2xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display font-bold capitalize">{m.market === "moneyline" && soccer ? "Win / Draw / Win" : m.market}{m.line !== undefined && m.market === "total" ? ` ${m.line}` : ""}</span>
                  <ConfidencePill tier={g.confidence} />
                </div>
                <div className={cn("grid gap-2", m.sides.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                  {m.sides.map((s) => {
                    const best = m.best?.side === s.side;
                    return (
                      <div key={s.side} className={cn("rounded-xl p-2.5 border", best && s.edge > 0 ? "border-primary/50 bg-primary/5" : "border-border bg-secondary/40")}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-display font-bold text-xs truncate">{s.side}</span>
                          <span className="font-mono text-[11px] text-muted-foreground num shrink-0">{price(s.price, settings.oddsFormat)}</span>
                        </div>
                        <div className="mt-2 flex items-end justify-between gap-1">
                          <div>
                            <div className="font-mono text-base font-bold num leading-none">{pct(s.modelProb, 1)}</div>
                            <div className="text-[10px] text-muted-foreground">mkt {pct(s.marketProb, 1)}</div>
                          </div>
                          <EdgeBadge edge={s.edge} />
                        </div>
                        {best && s.edge > 0 && g.status === "scheduled" && (
                          <div className="mt-2 flex items-center justify-between gap-1">
                            <span className="text-[10px] text-muted-foreground">EV {signedPct(s.ev)}</span>
                            <PickButton compact id={`${g.sport}:${g.id}:${m.market}:${s.side}`} sport={g.sport} eventId={g.id} game={label} homeAbbr={g.home.abbr} date={g.date} market={m.market} side={s.side} line={m.line} price={s.price} modelProb={s.modelProb} marketProb={s.marketProb} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {g.market && (g.market.openSpreadHome !== undefined || g.market.openTotal !== undefined) && (
              <div className="text-[11px] text-muted-foreground px-1 font-mono num">
                Open: {g.home.abbr} {g.market.openSpreadHome !== undefined ? spread(g.market.openSpreadHome) : "—"} / {g.market.openTotal ?? "—"} · Now: {g.market.spreadHome !== undefined ? spread(g.market.spreadHome) : "—"} / {g.market.total ?? "—"}
              </div>
            )}
          </section>
        )}

        <section className="glass rounded-2xl p-4">
          <h2 className="font-display font-bold mb-1">Why</h2>
          <ul className="divide-y divide-border">
            {g.factors.map((f) => (
              <li key={f.label} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{f.label}</span>
                  <span className={cn("font-mono text-xs num text-right", f.impact > 0 ? "text-profit" : f.impact < 0 ? "text-loss" : "text-muted-foreground")}>{f.value}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{f.explanation}</p>
              </li>
            ))}
          </ul>
        </section>

        {d.sim && (
          <section className="glass rounded-2xl p-4">
            <h2 className="font-display font-bold">Margin simulation <span className="text-xs text-muted-foreground font-body font-normal">({d.sim.n.toLocaleString()} runs)</span></h2>
            <p className="text-xs text-muted-foreground mb-2">Home margin ({g.home.abbr} minus {g.away.abbr}). Expected {g.model.expectedMargin > 0 ? "+" : ""}{g.model.expectedMargin.toFixed(soccer ? 2 : 1)}, total {g.model.expectedTotal.toFixed(soccer ? 2 : 1)}.</p>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={d.sim.histogram} margin={{ left: -24, right: 0, top: 4, bottom: 0 }}>
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#8a90a8" }} tickLine={false} axisLine={false} interval={soccer ? 0 : 2} />
                <YAxis tick={{ fontSize: 10, fill: "#8a90a8" }} tickFormatter={(v) => `${Math.round(v * 100)}%`} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#10121a", border: "1px solid #22263a", borderRadius: 12, fontSize: 12 }} formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`, "prob"]} labelFormatter={(l) => `margin ≈ ${l}`} />
                <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                  {d.sim.histogram.map((h) => <Cell key={h.bucket} fill={h.bucket > 0 ? "#0aff8c" : h.bucket < 0 ? "#ff3d7f" : "#8a90a8"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {cfg?.hasSpread && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <AltTable title={`${g.home.abbr} alt spreads`} rows={d.sim.altSpreads.map((r) => [spread(r.line), pct(r.homeCover)])} />
                <AltTable title="Alt totals (over)" rows={d.sim.altTotals.map((r) => [String(r.line), pct(r.over)])} />
              </div>
            )}
            {soccer && <div className="mt-3"><AltTable title="Goal totals (over)" rows={d.sim.altTotals.map((r) => [String(r.line), pct(r.over)])} /></div>}
          </section>
        )}

        {d.injuries.length > 0 && (
          <section className="glass rounded-2xl p-4">
            <h2 className="font-display font-bold mb-2">Injury report</h2>
            <ul className="space-y-1.5">
              {d.injuries.slice(0, 14).map((i, k) => (
                <li key={k} className="flex items-center justify-between text-sm">
                  <span><span className="text-muted-foreground font-mono text-xs mr-2">{i.team}</span>{i.player} <span className="text-muted-foreground text-xs">{i.position}</span></span>
                  <span className={cn("text-xs font-bold", /out|ir/i.test(i.status) ? "text-loss" : /quest|doubt/i.test(i.status) ? "text-warn" : "text-muted-foreground")}>{i.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasProps && <Link href={`/props?sport=${g.sport}&id=${g.id}`} className="block text-center rounded-2xl bg-primary text-primary-foreground font-display font-bold py-3">View player props for this game →</Link>}
      </div>
    </main>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl p-2", accent ? "bg-primary/10" : "bg-secondary/50")}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono font-bold text-lg num", accent && "text-primary")}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function AltTable({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <table className="w-full text-xs font-mono num">
        <tbody>
          {rows.map(([a, b]) => <tr key={a} className="border-t border-border/60"><td className="py-1">{a}</td><td className="py-1 text-right text-foreground">{b}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
