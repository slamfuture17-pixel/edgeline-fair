# EdgeLine Fair — AI sports predictions & player props (mobile-first PWA)

Calibrated win/spread/total probabilities and player-prop projections for **NFL, NBA, MLB and NHL**, built on real data, blended with the de-vigged betting market, and graded honestly against final scores and closing lines.

## Deploy in one click

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/slamfuture17-pixel/edgeline-fair)

Then open the Vercel URL on your phone → Share → **Add to Home Screen**.

## What's inside

| Layer | Implementation |
|---|---|
| **Data** | ESPN public feeds (no API key): schedules & results, live scoreboard, DraftKings lines incl. open/close, player-prop lines, rosters, injuries, per-game player logs. Adapter in `lib/espn.ts`; cache in `lib/cache.ts`. |
| **Game model** | `lib/elo.ts` margin-of-victory Elo with home advantage, season regression, rest; `lib/predict.ts` blends with the de-vigged market (power + Shin, `lib/odds.ts`), prices spreads/totals, computes EV + Kelly and plain-English factors; `app/api/game` runs a 10,000-draw Monte Carlo for alt lines. |
| **Props model** | `lib/props.ts` — two seasons of game logs, recency-weighted, role-filtered, shrunk toward the posted line, priced with normal (yardage) or negative-binomial (counts) distributions. |
| **Honesty** | `lib/store.ts` logs every displayed best-side and grades it after the final (hit rate, ROI, Brier, CLV). `lib/backtest.ts` walk-forward backtest vs. the closing market. Nothing on the Record tab is filtered. |
| **App** | Next.js 15 / React 19 / Tailwind, dark neon theme, bottom tabs, installable PWA. Screens: Today, Game detail, Props, Edge Finder, My Picks, Record, Settings. |

## Run locally

```bash
npm install
npm run backtest   # writes data/backtest-*.json for the Record tab
npm run dev        # http://localhost:3000
```

## Backtest (walk-forward, real games)

| Sport | Games | Elo Brier | Closing-market Brier | Blend Brier |
|---|---|---|---|---|
| NFL | 618 | 0.2211 | 0.2163 | 0.2168 |
| NBA | 2,631 | 0.2133 | 0.1748 | **0.1726** |
| MLB | 4,915 | 0.2455 | 0.2329 | 0.2333 |
| NHL | 1,415 | 0.2476 | 0.2364 | 0.2377 |

Lower is better; 0.25 = coin flip.

## Production notes

- On Vercel the prediction ledger and cache write to `/tmp` (ephemeral). Point `lib/store.ts` / `lib/cache.ts` at Postgres/KV for persistence, and run `npm run backtest` on a nightly cron to refresh the Record tab.

## Responsible use

Predictions are probabilistic estimates, not guarantees. Legal age only. If gambling is causing harm: 1-800-GAMBLER (US).
