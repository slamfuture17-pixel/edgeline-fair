"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash, RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Header } from "@/components/header";
import { EmptyState } from "@/components/empty";
import { usePicks, pickProfit } from "@/lib/picks";
import { useSettings } from "@/components/settings-provider";
import { kickoff, price, pct, signedPct, money } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function PicksPage() {
  const { picks, remove, save } = usePicks();
  const { settings } = useSettings();
  const [settling, setSettling] = useState(false);

  const settle = async () => {
    const pending = picks.filter((p) => !p.result && p.market !== "prop" && new Date(p.date).getTime() < Date.now());
    if (!pending.length) return;
    setSettling(true);
    try {
      const res = await fetch("/api/settle", { method: "POST", body: JSON.stringify(pending) });
      const j = await res.json();
      save(picks.map((p) => (j[p.id] ? { ...p, ...j[p.id] } : p)));
    } finally {
      setSettling(false);
    }
  };
  useEffect(() => { if (picks.length) void settle(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [picks.length]);

  const settled = picks.filter((p) => p.result);
  const stats = useMemo(() => {
    const wins = settled.filter((p) => p.result === "win").length;
    const losses = settled.filter((p) => p.result === "loss").length;
    const profit = settled.reduce((a, p) => a + pickProfit(p), 0);
    const staked = settled.reduce((a, p) => a + (p.result === "push" ? 0 : p.stake), 0);
    const clv = settled.filter((p) => p.clv !== undefined);
    return { wins, losses, profit, roi: staked ? profit / staked : 0, clv: clv.length ? clv.reduce((a, p) => a + (p.clv ?? 0), 0) / clv.length : null, clvN: clv.length };
  }, [settled]);
  const curve = useMemo(() => {
    let bal = settings.bankroll;
    return [{ i: 0, bal }, ...settled.sort((a, b) => a.date.localeCompare(b.date)).map((p, i) => { bal += pickProfit(p); return { i: i + 1, bal }; })];
  }, [settled, settings.bankroll]);

  return (
    <main>
      <Header title="My Picks" subtitle="Tracked locally on this device" />
      <div className="px-4 pt-3 space-y-3">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Bankroll</div>
              <div className={cn("font-mono font-bold text-2xl num", stats.profit >= 0 ? "text-profit" : "text-loss")}>{money(settings.bankroll + stats.profit)}</div>
            </div>
            <button onClick={settle} className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold flex items-center gap-1"><RefreshCw className={cn("h-3.5 w-3.5", settling && "animate-spin")} /> Settle</button>
          </div>
          <ResponsiveContainer width="100%" height={90}>
            <AreaChart data={curve} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
              <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0aff8c" stopOpacity={0.5} /><stop offset="100%" stopColor="#0aff8c" stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="i" hide /><YAxis hide domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "#10121a", border: "1px solid #22263a", borderRadius: 12, fontSize: 12 }} formatter={(v) => [money(Number(v)), "bankroll"]} />
              <Area type="monotone" dataKey="bal" stroke="#0aff8c" fill="url(#g)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-4 gap-2 text-center mt-2">
            <Mini label="Record" value={`${stats.wins}-${stats.losses}`} />
            <Mini label="ROI" value={signedPct(stats.roi)} tone={stats.roi} />
            <Mini label="Profit" value={money(stats.profit)} tone={stats.profit} />
            <Mini label="CLV" value={stats.clv === null ? "—" : signedPct(stats.clv)} tone={stats.clv ?? 0} sub={stats.clvN ? `n=${stats.clvN}` : ""} />
          </div>
        </div>
        {picks.length === 0 && <EmptyState title="No picks tracked yet" body="Tap Track on any game, market, or prop to log it here. Results and closing-line value settle automatically." />}
        {[...picks].reverse().map((p) => (
          <div key={p.id} className="glass rounded-2xl p-3 flex items-center gap-3">
            <div className={cn("w-1.5 self-stretch rounded-full", p.result === "win" ? "bg-profit" : p.result === "loss" ? "bg-loss" : p.result === "push" ? "bg-warn" : "bg-pend")} />
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold truncate">{p.side} <span className="text-muted-foreground font-mono text-xs">{price(p.price, settings.oddsFormat)}</span></div>
              <div className="text-[11px] text-muted-foreground truncate">{p.sport.toUpperCase()} · {p.game} · {kickoff(p.date)}{p.homeScore !== undefined ? ` · ${p.awayScore}-${p.homeScore}` : ""}</div>
              <div className="text-[11px] text-muted-foreground font-mono num">${p.stake} · model {pct(p.modelProb, 1)}{p.clv !== undefined ? ` · CLV ${signedPct(p.clv)}` : ""}</div>
            </div>
            <div className="text-right">
              <div className={cn("font-mono font-bold num", p.result === "win" ? "text-profit" : p.result === "loss" ? "text-loss" : "text-muted-foreground")}>{p.result ? (p.result === "push" ? "PUSH" : money(pickProfit(p))) : "OPEN"}</div>
              <button onClick={() => remove(p.id)} className="mt-1 text-muted-foreground" aria-label="Remove"><Trash className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </main>
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
