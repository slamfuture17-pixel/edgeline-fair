"use client";

import { Bookmark, Check } from "lucide-react";
import { usePicks } from "@/lib/picks";
import { useSettings } from "./settings-provider";
import { kellyFraction } from "@/lib/odds";
import { cn } from "@/lib/utils";

interface Props {
  id: string; sport: string; eventId: string; game: string; homeAbbr: string; date: string;
  market: string; side: string; line?: number; price: number; modelProb: number; marketProb: number;
  compact?: boolean;
}

export function PickButton(p: Props) {
  const { add, remove, has } = usePicks();
  const { settings } = useSettings();
  const saved = has(p.id);
  const stake = Math.max(0, Math.round(settings.bankroll * settings.kellyFraction * kellyFraction(p.modelProb, p.price)));
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (saved) remove(p.id); else add({ ...p, stake: stake || Math.round(settings.bankroll * 0.01) }); }}
      className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-display font-bold transition-all", saved ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-accent")}
    >
      {saved ? <Check className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
      {!p.compact && (saved ? "Tracked" : `Track${stake ? ` $${stake}` : ""}`)}
    </button>
  );
}
