"use client";

import { Header } from "@/components/header";
import { useSettings } from "@/components/settings-provider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { settings, update } = useSettings();
  return (
    <main>
      <Header title="Settings" back="/" />
      <div className="px-4 pt-4 space-y-3">
        <section className="glass rounded-2xl p-4 space-y-4">
          <Field label="Bankroll ($)" hint="Used for Kelly stake suggestions only. Nothing is placed for you.">
            <input type="number" inputMode="numeric" value={settings.bankroll} onChange={(e) => update({ bankroll: Math.max(0, Number(e.target.value)) })} className="w-full rounded-xl bg-secondary px-3 py-2 font-mono num outline-none focus:ring-2 ring-primary" />
          </Field>
          <Field label="Kelly fraction" hint="Quarter Kelly is the professional default; full Kelly is aggressive.">
            <Seg value={settings.kellyFraction} options={[[0.1, "1/10"], [0.25, "1/4"], [0.5, "1/2"], [1, "Full"]]} onChange={(v) => update({ kellyFraction: v })} />
          </Field>
          <Field label="Odds format">
            <Seg value={settings.oddsFormat} options={[["american", "American"], ["decimal", "Decimal"]]} onChange={(v) => update({ oddsFormat: v })} />
          </Field>
          <Field label="Minimum edge to show">
            <Seg value={settings.minEdge} options={[[0.01, "1%"], [0.02, "2%"], [0.03, "3%"], [0.05, "5%"]]} onChange={(v) => update({ minEdge: v })} />
          </Field>
        </section>

        <section className="glass rounded-2xl p-4 space-y-3">
          <h2 className="font-display font-bold">Responsible play</h2>
          <div className="flex items-center justify-between">
            <div><div className="text-sm font-medium">I am of legal betting age where I live</div><div className="text-xs text-muted-foreground">21+ in most US states.</div></div>
            <Switch checked={settings.ageConfirmed} onCheckedChange={(v) => update({ ageConfirmed: v })} />
          </div>
          <p className="text-xs text-muted-foreground">This app produces probabilistic estimates for information and entertainment. It does not place bets, guarantee outcomes, or constitute financial advice. If gambling is causing harm, call or text <span className="font-mono">1-800-GAMBLER</span> (US) or visit ncpgambling.org.</p>
        </section>

        <section className="glass rounded-2xl p-4 space-y-2 text-xs text-muted-foreground">
          <h2 className="font-display font-bold text-foreground text-base">How it works</h2>
          <p><b className="text-foreground">Data.</b> Results, schedules, injuries, rosters and game logs from ESPN&apos;s public feeds; lines from DraftKings (via ESPN) including opening and closing prices. Nothing is simulated or hand-entered.</p>
          <p><b className="text-foreground">Game model.</b> Margin-of-victory Elo with home advantage, season regression and rest adjustments, trained walk-forward across the last 2–3 seasons, blended with the de-vigged market price (power + Shin). Spreads and totals are priced from a normal margin/total model with a 10,000-run Monte Carlo for alt lines.</p>
          <p><b className="text-foreground">Props.</b> Each player&apos;s last two seasons of game logs, recency-weighted, filtered to games with a real role, shrunk toward the market line as a Bayesian prior, and priced with normal (yardage) or negative-binomial (counts) distributions.</p>
          <p><b className="text-foreground">Honesty.</b> Every displayed best-side is logged with the market at that moment and graded against the final score and closing line. The Record tab never filters.</p>
          <p><b className="text-foreground">Install on phone.</b> Open this site in Safari/Chrome → Share → &quot;Add to Home Screen&quot;. It runs full-screen like a native app.</p>
        </section>
      </div>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-medium mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, l]) => (
        <button key={String(v)} onClick={() => onChange(v)} className={cn("rounded-xl py-2 text-sm font-bold border", value === v ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/50 border-border text-muted-foreground")}>{l}</button>
      ))}
    </div>
  );
}
