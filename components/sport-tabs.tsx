"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { leaguesByGroup, SPORTS, type SportGroup } from "@/lib/sports";

const GROUP_ICON: Record<SportGroup, string> = { Football: "🏈", Basketball: "🏀", Baseball: "⚾", Hockey: "🏒", Soccer: "⚽", Tennis: "🎾", MMA: "🥊" };

/** Two-row league picker: sport group chips, then the leagues inside the selected group. */
export function SportTabs({ value, onChange, includeAll }: { value: string; onChange: (v: string) => void; includeAll?: boolean }) {
  const groups = useMemo(() => leaguesByGroup(), []);
  const activeGroup: SportGroup | "all" = value === "all" ? "all" : (SPORTS[value]?.group ?? "Football");
  const leagues = activeGroup === "all" ? [] : groups.find((g) => g.group === activeGroup)?.leagues ?? [];
  return (
    <div className="space-y-1">
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pt-3">
        {includeAll && (
          <button onClick={() => onChange("all")} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-display font-bold border", value === "all" ? "bg-primary text-primary-foreground border-primary shadow-profit" : "bg-secondary/60 text-muted-foreground border-border")}>All</button>
        )}
        {groups.map((g) => (
          <button key={g.group} onClick={() => onChange(g.leagues[0].key)} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-display font-bold border", activeGroup === g.group ? "bg-primary text-primary-foreground border-primary shadow-profit" : "bg-secondary/60 text-muted-foreground border-border")}>
            <span className="mr-1">{GROUP_ICON[g.group]}</span>{g.group}
          </button>
        ))}
      </div>
      {leagues.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 pb-2 pt-1">
          {leagues.map((l) => (
            <button key={l.key} onClick={() => onChange(l.key)} className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-bold border", value === l.key ? "bg-primary/15 text-primary border-primary/40" : "border-border text-muted-foreground")}>{l.label}</button>
          ))}
        </div>
      )}
      {leagues.length <= 1 && <div className="pb-2" />}
    </div>
  );
}
