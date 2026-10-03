"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface Settings {
  bankroll: number;
  kellyFraction: number;
  minEdge: number;
  oddsFormat: "american" | "decimal";
  sports: string[];
  ageConfirmed: boolean;
}

const DEFAULTS: Settings = { bankroll: 1000, kellyFraction: 0.25, minEdge: 0.02, oddsFormat: "american", sports: ["nfl", "nba", "mlb", "nhl"], ageConfirmed: false };

const Ctx = createContext<{ settings: Settings; update: (p: Partial<Settings>) => void }>({ settings: DEFAULTS, update: () => {} });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("edgelinefair:settings");
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);
  const update = useCallback((p: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...p };
      localStorage.setItem("edgelinefair:settings", JSON.stringify(next));
      return next;
    });
  }, []);
  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  return useContext(Ctx);
}
