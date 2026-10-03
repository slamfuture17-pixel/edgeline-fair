"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Header } from "@/components/header";
import { SportTabs } from "@/components/sport-tabs";
import { CardSkeletons, EmptyState } from "@/components/empty";
import { pct, signedPct } from "@/lib/format";
import type { BacktestSummary, LoggedPrediction } from "@/types";
import { cn } from "@/lib/utils";

interface Live { logged: number; pending: number; settled: number; wins: number; hitRate: number | null; roi: number | null; brier: number | null; clvAvg: number | null; clvN: number }
interface Perf { backtests: Record<string, BacktestSummary | null>; live: { all: Live; bySport: Record<string, Live>; recent: LoggedPrediction[] } }

export default function PerformancePage() {
  const [sport, setSport] = useState("nfl");
  const [d, setD] = useState<Perf | null>(null);
  useEffect(() => { fetch("/api/performance").then((r) => r.json()).then(setD); }, []);
  const bt = d?.backtests[sport];
  const live = d?.live.bySport[sport];

  return (
    <main>
      <Header title="Record" subtitle="Unfiltered. Every number is computed from logged predictions." />
      <SportTabs value={sport} onChange={setSport} />
      {!d && <CardSkeletons n={3} />}
      {d && !bt && <EmptyState title="Backtest not generated yet" body="Run `npm run backtest` to produce the walk-forward report for this sport." />}
      {bt && (
        <div className="px-4 space-y-3">
          <section className="glass rounded-2xl p-4">
            <h2 className="font-display font-bold">Walk-forward backtest</h2>
            <p className="text-xs text-muted-foreground">{bt.games.toLocaleString()} real games, seasons {bt.seasons.join(", ")}. Closing-line comparison on the most recent {bt.gamesWithMarket} games. Lower Brier / log-loss is better; 0.25 Brier = coin flip.</p>
            <table className="w-full mt-3 text-sm font-mono num">
              <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground"><th className="text-left font-normal">Model</th><th className="font-normal">Brier</th><th className="font-normal">Log-loss</th><th className="font-normal">Acc</th></tr></thead>
              <tbody>
                <Row name="Elo only (ours)" s={bt.elo} />
                {bt.market && <Row name="Closing market" s={bt.market} />}
                {bt.blend && <Row name="Blend (shipped)" s={bt.blend} accent best={!!bt.market && bt.blend.brier <= bt.market.brier} />}
              </tbody>
            </table>
            <p className="text-[11px] text-muted-foreground mt-2">
              {bt.market && bt.blend ? (bt.blend.brier <= bt.market.brier ? "The blend matched or beat the closing market on calibration in this window." : `The closing market is still slightly better calibrated (Δ Brier ${(bt.blend.brier - bt.market.brier).toFixed(4)}). That is expected — it is why market weight is high and why edges are small.`) : "No market prices in this window."}
            </p>
          </section>

          <section className="glass rounded-2xl p-4">
            <h2 className="font-display font-bold">Calibration</h2>
            <p className="text-xs text-muted-foreground mb-2">When we say X%, does it happen X% of the time?</p>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={bt.calibration} margin={{ left: -20, right: 0, top: 4, bottom: 0 }}>
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#8a90a8" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#8a90a8" }} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#10121a", border: "1px solid #22263a", borderRadius: 12, fontSize: 12 }} formatter={(v, n, p) => [`${(Number(v) * 100).toFixed(1)}% (n=${(p.payload as { n: number }).n})`, n === "predicted" ? "predicted" : "actual"]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="predicted" fill="#3fb6ff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" fill="#0aff8c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>

          <section className="glass rounded-2xl p-4">
            <h2 className="font-display font-bold">Betting the disagreements</h2>
            <p className="text-xs text-muted-foreground mb-2">Flat 1u on every side where the blend exceeded the de-vigged closing price by the threshold. Small samples — read with caution.</p>
            <table className="w-full text-sm font-mono num">
              <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground"><th className="text-left font-normal">Min edge</th><th className="font-normal">Bets</th><th className="font-normal">Win%</th><th className="font-normal">ROI</th></tr></thead>
              <tbody>
                {bt.edgeBets.map((e) => (
                  <tr key={e.threshold} className="border-t border-border/60">
                    <td className="py-1.5">{Math.round(e.threshold * 100)}%</td>
                    <td className="text-center">{e.bets}</td>
                    <td className="text-center">{e.bets ? pct(e.wins / e.bets) : "—"}</td>
                    <td className={cn("text-center font-bold", e.roi > 0 ? "text-profit" : e.roi < 0 ? "text-loss" : "")}>{e.bets ? signedPct(e.roi) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="glass rounded-2xl p-4">
            <h2 className="font-display font-bold">Live ledger</h2>
            <p className="text-xs text-muted-foreground">Every best-side the app showed for an upcoming game is logged at that moment and graded after the final.</p>
            {live && (
              <div className="grid grid-cols-4 gap-2 text-center mt-3">
                <Mini label="Logged" value={String(live.logged)} sub={`${live.pending} open`} />
                <Mini label="Hit rate" value={live.hitRate === null ? "—" : pct(live.hitRate)} sub={`${live.settled} settled`} />
                <Mini label="ROI" value={live.roi === null ? "—" : signedPct(live.roi)} tone={live.roi ?? 0} />
                <Mini label="CLV" value={live.clvAvg === null ? "—" : signedPct(live.clvAvg)} tone={live.clvAvg ?? 0} sub={live.clvN ? `n=${live.clvN}` : ""} />
              </div>
            )}
            <ul className="mt-3 divide-y divide-border/60">
              {d!.live.recent.filter((r) => r.sport === sport).slice(0, 12).map((r) => (
                <li key={r.id} className="py-1.5 flex items-center justify-between text-xs">
                  <span className="truncate">{r.gameLabel} · {r.side}</span>
                  <span className={cn("font-mono font-bold", r.result === "win" ? "text-profit" : r.result === "loss" ? "text-loss" : "text-warn")}>{r.result?.toUpperCase()}</span>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-[11px] text-muted-foreground text-center px-2">Generated {new Date(bt.generatedAt).toLocaleString()}. No cherry-picking: thresholds and windows are fixed in code.</p>
        </div>
      )}
    </main>
  );
}

function Row({ name, s, accent, best }: { name: string; s: { brier: number; logLoss: number; accuracy: number }; accent?: boolean; best?: boolean }) {
  return (
    <tr className={cn("border-t border-border/60", accent && "text-primary")}>
      <td className="py-1.5 font-body">{name}{best && <span className="ml-1 text-[10px]">★</span>}</td>
      <td className="text-center">{s.brier.toFixed(4)}</td>
      <td className="text-center">{s.logLoss.toFixed(4)}</td>
      <td className="text-center">{pct(s.accuracy, 1)}</td>
    </tr>
  );
}

function Mini({ label, value, tone = 0, sub }: { label: string; value: string; tone?: number; sub?: string }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono font-bold num", tone > 0 ? "text-profit" : tone < 0 ? "text-loss" : "")}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
