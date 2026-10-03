"use client";

import { cn } from "@/lib/utils";

const ALL = [
  { key: "nfl", label: "NFL" },
  { key: "nba", label: "NBA" },
  { key: "mlb", label: "MLB" },
  { key: "nhl", label: "NHL" },
];

export function SportTabs({ value, onChange, includeAll }: { value: string; onChange: (v: string) => void; includeAll?: boolean }) {
  const items = includeAll ? [{ key: "all", label: "All" }, ...ALL] : ALL;
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3">
      {items.map((s) => (
        <button key={s.key} onClick={() => onChange(s.key)} className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-display font-bold tracking-wide transition-all border", value === s.key ? "bg-primary text-primary-foreground border-primary shadow-profit" : "bg-secondary/60 text-muted-foreground border-border")}>{s.label}</button>
      ))}
    </div>
  );
}
