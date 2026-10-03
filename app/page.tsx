"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { Header } from "@/components/header";
import { SportTabs } from "@/components/sport-tabs";
import { GameCard } from "@/components/game-card";
import { CardSkeletons, EmptyState } from "@/components/empty";
import type { GamePrediction } from "@/types";

export default function TodayPage() {
  const [sport, setSport] = useState("nfl");
  const [games, setGames] = useState<GamePrediction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      const res = await fetch(`/api/slate?sport=${sport}&days=3`);
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

  const scheduled = games?.filter((g) => g.status !== "final") ?? [];
  const finals = games?.filter((g) => g.status === "final") ?? [];

  return (
    <main>
      <Header title="Today" subtitle="Model vs. market, every game" />
      <div className="flex items-center">
        <div className="flex-1"><SportTabs value={sport} onChange={setSport} /></div>
        <button onClick={load} className="mr-4 rounded-full bg-secondary p-2 text-muted-foreground" aria-label="Refresh">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>
      {error && <EmptyState title="Couldn't load the slate" body={error} />}
      {!games && !error && <CardSkeletons />}
      {games && games.length === 0 && <EmptyState title="No games in the next 3 days" body="Try another sport." />}
      <div className="space-y-3 px-4">{scheduled.map((g, i) => <GameCard key={g.id} g={g} index={i} />)}</div>
      {finals.length > 0 && (
        <>
          <h2 className="px-4 pt-6 pb-2 text-xs uppercase tracking-widest text-muted-foreground font-display">Final</h2>
          <div className="space-y-3 px-4">{finals.map((g, i) => <GameCard key={g.id} g={g} index={i} />)}</div>
        </>
      )}
      <p className="px-6 pt-6 text-[11px] text-muted-foreground text-center">Probabilities are model estimates, not guarantees. Lines from DraftKings via ESPN; refreshes every minute. 21+. Please bet responsibly.</p>
    </main>
  );
}
