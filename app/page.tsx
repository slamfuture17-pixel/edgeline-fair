"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { Header } from "@/components/header";
import { SportTabs } from "@/components/sport-tabs";
import { GameCard } from "@/components/game-card";
import { CardSkeletons, EmptyState } from "@/components/empty";
import { SPORTS } from "@/lib/sports";
import type { GamePrediction } from "@/types";

export default function TodayPage() {
  const [sport, setSport] = useState("nfl");
  const [games, setGames] = useState<GamePrediction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    try { const s = localStorage.getItem("edgelinefair:sport"); if (s && SPORTS[s]) setSport(s); } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      const res = await fetch(`/api/slate?sport=${sport}&days=${SPORTS[sport]?.kind === "athlete" ? 4 : 3}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setGames(data.games);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [sport]);

  useEffect(() => {
    setGames(null);
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const pick = (s: string) => { setSport(s); try { localStorage.setItem("edgelinefair:sport", s); } catch { /* ignore */ } };
  const cfg = SPORTS[sport];
  const scheduled = games?.filter((g) => g.status !== "final") ?? [];
  const finals = games?.filter((g) => g.status === "final") ?? [];

  return (
    <main>
      <Header title="Today" subtitle={cfg ? `${cfg.name} · model vs. market` : "Model vs. market, every game"} />
      <div className="flex items-start">
        <div className="flex-1 min-w-0"><SportTabs value={sport} onChange={pick} /></div>
        <button onClick={load} className="mr-4 mt-3 rounded-full bg-secondary p-2 text-muted-foreground shrink-0" aria-label="Refresh">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>
      {error && <EmptyState title="Couldn't load the slate" body={error} />}
      {!games && !error && (
        <>
          <p className="px-6 pb-2 text-[11px] text-muted-foreground text-center">First load of a league builds its rating model from 1–3 seasons of results — this can take up to a minute. It is instant after that.</p>
          <CardSkeletons />
        </>
      )}
      {games && games.length === 0 && <EmptyState title={`No ${cfg?.label ?? ""} games in the next few days`} body="Try another league." />}
      <div className="space-y-3 px-4">{scheduled.map((g, i) => <GameCard key={g.id} g={g} index={i} />)}</div>
      {finals.length > 0 && (
        <>
          <h2 className="px-4 pt-6 pb-2 text-xs uppercase tracking-widest text-muted-foreground font-display">Final</h2>
          <div className="space-y-3 px-4">{finals.map((g, i) => <GameCard key={g.id} g={g} index={i} />)}</div>
        </>
      )}
      <p className="px-6 pt-6 text-[11px] text-muted-foreground text-center">
        {cfg?.marketWeight === 0 ? "No bookmaker prices exist for this tour in our data source, so these are pure model probabilities with no edge calculation. " : "Lines from DraftKings via ESPN; refreshes every minute. "}
        Probabilities are model estimates, not guarantees. 21+. Please bet responsibly.
      </p>
    </main>
  );
}
