"use client";

import { useCallback, useEffect, useState } from "react";

export interface Pick {
  id: string;
  sport: string;
  eventId: string;
  game: string;
  homeAbbr: string;
  date: string;
  market: string;
  side: string;
  line?: number;
  price: number;
  modelProb: number;
  marketProb: number;
  stake: number;
  createdAt: string;
  result?: "win" | "loss" | "push";
  homeScore?: number;
  awayScore?: number;
  clv?: number;
  closingPrice?: number;
}

const KEY = "edgelinefair:picks";

export function usePicks() {
  const [picks, setPicks] = useState<Pick[]>([]);
  useEffect(() => {
    try { setPicks(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { /* ignore */ }
  }, []);
  const save = useCallback((next: Pick[]) => {
    setPicks(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }, []);
  const add = useCallback((p: Omit<Pick, "createdAt">) => {
    setPicks((cur) => {
      if (cur.some((x) => x.id === p.id)) return cur;
      const next = [...cur, { ...p, createdAt: new Date().toISOString() }];
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const remove = useCallback((id: string) => {
    setPicks((cur) => {
      const next = cur.filter((x) => x.id !== id);
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const has = useCallback((id: string) => picks.some((x) => x.id === id), [picks]);
  return { picks, add, remove, has, save };
}

export function pickProfit(p: Pick): number {
  if (!p.result || p.result === "push") return 0;
  if (p.result === "loss") return -p.stake;
  return p.price > 0 ? (p.stake * p.price) / 100 : (p.stake * 100) / Math.abs(p.price);
}
