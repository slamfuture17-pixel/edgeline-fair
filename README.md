# EdgeLine Fair — AI sports predictions & player props (mobile-first PWA)

Calibrated probabilities and player-prop projections for **NFL, NCAAF, NBA, WNBA, NCAAB, MLB, NHL, 22 soccer leagues, ATP/WTA tennis and UFC**, built on real data, blended with the de-vigged betting market, and graded honestly against final scores and closing lines.

## Deploy in one click

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/slamfuture17-pixel/edgeline-fair)

Then open the Vercel URL on your phone → Share → **Add to Home Screen**.

## Coverage

| Group | Leagues | Market feed |
|---|---|---|
| Football | NFL, College Football (FBS) | DraftKings ML / spread / total |
| Basketball | NBA, WNBA, College Basketball (D-I) | DraftKings ML / spread / total |
| Baseball / Hockey | MLB, NHL | DraftKings ML / run-puck line / total |
| Soccer | EPL, La Liga, Bundesliga, Serie A, Ligue 1, UCL, Europa, MLS, Liga MX, Brasileirão, Argentina, Eredivisie, Primeira, Championship, Süper Lig, SPFL, Belgium, Saudi, J-League, A-League, Libertadores, NWSL | DraftKings 3-way + goal total |
| Tennis | ATP, WTA | none in source → model-only |
| MMA | UFC | DraftKings fight moneyline |

Boxing has no public data feed and is intentionally excluded rather than faked.

## Models

- **Team sports** — margin-of-victory Elo (home advantage, season regression, rest), blended with the de-vigged market in log-odds space; normal margin/total pricing; 10,000-run Monte Carlo for alt lines. Participants with <3 rated games defer 95% to the market.
- **Soccer** — Elo margin + scoring form → Poisson goal rates → win/draw/win and goal-total probabilities, blended with the de-vigged three-way price (power method).
- **Tennis / UFC** — per-athlete Elo from every tour match (39k tennis matches, 1.6k UFC bouts). UFC blends with DraftKings; tennis is model-only.
- **Props** — two seasons of player game logs, recency-weighted, role-filtered, shrunk toward the posted line; normal (yardage) or negative-binomial (counts).
- **Honesty** — every displayed best-side is logged and graded after the final (hit rate, ROI, Brier, CLV); walk-forward backtests on the Record tab.

## Run locally

```bash
npm install
npm run backtest nfl   # per league; writes data/backtest-*.json
npm run dev            # http://localhost:3000
```

## Production notes

On Vercel the ledger and cache write to `/tmp` (ephemeral). Point `lib/store.ts` / `lib/cache.ts` at Postgres/KV for persistence, and refresh backtests on a nightly cron.

## Responsible use

Predictions are probabilistic estimates, not guarantees. Legal age only. If gambling is causing harm: 1-800-GAMBLER (US).
