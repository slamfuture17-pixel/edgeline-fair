// Multi-book market layer: DraftKings (via ESPN), Kalshi, Polymarket.
// Produces per-side quotes for line shopping and a de-vigged consensus for the model blend.
import { cached, TTL } from "./cache";
import { SPORTS, SportKey } from "./sports";
import { getJson, ScoreboardGame } from "./espn";
import { americanToImplied, probToAmerican, devigPower } from "./odds";
import { logit, sigmoid } from "./math";
import type { MarketLines } from "@/types";

export type BookId = "draftkings" | "kalshi" | "polymarket";
export type Market = "moneyline" | "spread" | "total";
export type Side = "home" | "away" | "draw" | "over" | "under";

export interface BookQuote {
  book: BookId;
  market: Market;
  side: Side;
  line?: number;
  prob: number; // implied probability at the price you can actually take
  price: number; // american equivalent
  liquidity?: number;
  url?: string;
}

export const BOOK_LABEL: Record<BookId, string> = { draftkings: "DraftKings", kalshi: "Kalshi", polymarket: "Polymarket" };

export function dkQuotes(m: MarketLines | undefined): BookQuote[] {
  if (!m) return [];
  const q: BookQuote[] = [];
  const add = (market: Market, side: Side, price: number | undefined, line?: number) => {
    if (price === undefined || !isFinite(price)) return;
    q.push({ book: "draftkings", market, side, line, prob: americanToImplied(price), price });
  };
  add("moneyline", "home", m.homeML);
  add("moneyline", "away", m.awayML);
  add("moneyline", "draw", m.drawML);
  if (m.spreadHome !== undefined) { add("spread", "home", m.spreadHomeOdds ?? -110, m.spreadHome); add("spread", "away", m.spreadAwayOdds ?? -110, m.spreadHome); }
  if (m.total !== undefined) { add("total", "over", m.overOdds ?? -110, m.total); add("total", "under", m.underOdds ?? -110, m.total); }
  return q;
}

/* ---------------- Kalshi ---------------- */
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const KALSHI_PREFIX: Record<string, string> = {
  nfl: "KXNFL", ncaaf: "KXNCAAF", nba: "KXNBA", wnba: "KXWNBA", ncaab: "KXNCAAB", mlb: "KXMLB", nhl: "KXNHL",
  epl: "KXEPL", laliga: "KXLALIGA", bundesliga: "KXBUNDESLIGA", seriea: "KXSERIEA", ligue1: "KXLIGUE1", mls: "KXMLS", ligamx: "KXLIGAMX", ucl: "KXUCL",
  ufc: "KXUFC", atp: "KXATP", wta: "KXWTA",
};
const KALSHI_ABBR: Record<string, string> = { WAS: "WSH", JAC: "JAX", LA: "LAR" };

interface KMarket {
  ticker: string; event_ticker: string; title?: string; yes_sub_title?: string; no_sub_title?: string;
  yes_bid_dollars?: string; yes_ask_dollars?: string; no_bid_dollars?: string; no_ask_dollars?: string; last_price_dollars?: string;
  floor_strike?: number; open_interest_fp?: string; volume_fp?: string; status?: string;
}

async function kalshiSeries(series: string): Promise<KMarket[]> {
  return cached(`kalshi:${series}`, TTL.fiveMin, async () => {
    const out: KMarket[] = [];
    let cursor = "";
    for (let i = 0; i < 4; i++) {
      const d: { markets?: KMarket[]; cursor?: string } = await getJson<{ markets?: KMarket[]; cursor?: string }>(`${KALSHI}/markets?series_ticker=${series}&status=open&limit=200${cursor ? `&cursor=${cursor}` : ""}`).catch(() => ({ markets: [] as KMarket[] }));
      out.push(...(d.markets || []));
      cursor = d.cursor || "";
      if (!cursor || (d.markets || []).length < 200) break;
    }
    return out;
  });
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** Word-overlap score between a book label ("Los Angeles R", "HOU Texans", "Daniil Medvedev") and a participant. */
function labelScore(label: string | undefined, team: { abbr: string; name: string; fullName?: string }): number {
  if (!label) return 0;
  const l = norm(label);
  if (!l) return 0;
  const a = norm(team.abbr);
  if (l === a) return 10;
  const words = new Set(l.split(" ").filter((w) => w.length > 1));
  let score = 0;
  for (const w of norm(team.name).split(" ")) if (w.length > 2 && words.has(w)) score += 3;
  for (const w of norm(team.fullName ?? "").split(" ")) if (w.length > 2 && words.has(w)) score += 1;
  if (words.has(a) && a.length >= 2) score += 4;
  const last = l.split(" ").pop() ?? "";
  if (last.length === 1 && norm(team.name).startsWith(last)) score += 1;
  return score;
}
function labelMatches(label: string | undefined, team: { abbr: string; name: string; fullName?: string }): boolean {
  return labelScore(label, team) >= 3;
}
function pickSide(label: string | undefined, g: ScoreboardGame): "home" | "away" | undefined {
  const h = labelScore(label, g.home), a = labelScore(label, g.away);
  if (h === 0 && a === 0) return undefined;
  if (h === a) return undefined;
  return h > a ? "home" : "away";
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function eventMatchesGame(eventTicker: string, g: ScoreboardGame): boolean {
  // KXNFLGAME-26OCT04INDWAS -> date 26OCT04, teams INDWAS
  const m = eventTicker.match(/-(\d{2})([A-Z]{3})(\d{2})(\d{4})?([A-Z0-9]+)$/);
  if (!m) return false;
  const d = new Date(Date.UTC(2000 + Number(m[1]), MONTHS.indexOf(m[2]), Number(m[3])));
  if (Math.abs(d.getTime() - new Date(g.date).getTime()) > 36 * 3_600_000) return false;
  const teams = m[5];
  const canon = (x: string) => KALSHI_ABBR[x] ?? x;
  for (let k = 2; k <= Math.min(4, teams.length - 2); k++) {
    const a = canon(teams.slice(0, k)), h = canon(teams.slice(k));
    if (a === g.away.abbr.toUpperCase() && h === g.home.abbr.toUpperCase()) return true;
  }
  return false;
}

function eventNear(eventTicker: string, g: ScoreboardGame): boolean {
  const m = eventTicker.match(/-(\d{2})([A-Z]{3})(\d{2})/);
  if (!m) return false;
  const d = new Date(Date.UTC(2000 + Number(m[1]), MONTHS.indexOf(m[2]), Number(m[3])));
  return Math.abs(d.getTime() - new Date(g.date).getTime()) < 36 * 3_600_000;
}

async function kalshiQuotes(sport: SportKey, g: ScoreboardGame): Promise<BookQuote[]> {
  const prefix = KALSHI_PREFIX[sport];
  if (!prefix) return [];
  const cfg = SPORTS[sport];
  const athlete = cfg.kind === "athlete";
  const seriesList = athlete ? [`${prefix}${sport === "ufc" ? "FIGHT" : "MATCH"}`] : [`${prefix}GAME`, ...(cfg.hasSpread ? [`${prefix}SPREAD`] : []), ...(cfg.hasTotal ? [`${prefix}TOTAL`] : [])];
  const lists = await Promise.all(seriesList.map((s) => kalshiSeries(s)));
  const out: BookQuote[] = [];
  const take = (m: KMarket, side: Side, market: Market, line?: number) => {
    // Buying YES costs the ask; buying NO costs the no-ask. Use the ask as the executable price.
    const yesAsk = Number(m.yes_ask_dollars), noAsk = Number(m.no_ask_dollars);
    const liq = Number(m.open_interest_fp || 0);
    const url = `https://kalshi.com/markets/${m.event_ticker.split("-")[0].toLowerCase()}/${m.event_ticker.toLowerCase()}`;
    if (isFinite(yesAsk) && yesAsk > 0 && yesAsk < 1) out.push({ book: "kalshi", market, side, line, prob: yesAsk, price: probToAmerican(yesAsk), liquidity: liq, url });
    return { noAsk, liq, url };
  };
  const gameMs = lists[0].filter((m) => athlete ? (labelMatches(m.yes_sub_title, g.home) || labelMatches(m.yes_sub_title, g.away)) && eventNear(m.event_ticker, g) : eventMatchesGame(m.event_ticker, g));
  for (const m of gameMs) {
    const label = m.yes_sub_title || m.title || "";
    if (/^tie\b|draw/i.test(label)) { take(m, "draw", "moneyline"); continue; }
    const sd = pickSide(label, g);
    if (sd) take(m, sd, "moneyline");
  }
  if (!athlete && cfg.hasSpread && lists[1]) {
    for (const m of lists[1].filter((m) => eventMatchesGame(m.event_ticker, g))) {
      const strike = m.floor_strike;
      if (strike === undefined) continue;
      const sd = pickSide(m.yes_sub_title || m.title || "", g);
      // "X wins by over N.5 points" == X covers -N.5 ; the NO side == opponent covers +N.5
      if (sd === "home") { const r = take(m, "home", "spread", -strike); if (isFinite(r.noAsk) && r.noAsk > 0 && r.noAsk < 1) out.push({ book: "kalshi", market: "spread", side: "away", line: -strike, prob: r.noAsk, price: probToAmerican(r.noAsk), liquidity: r.liq, url: r.url }); }
      else if (sd === "away") { const r = take(m, "away", "spread", strike); if (isFinite(r.noAsk) && r.noAsk > 0 && r.noAsk < 1) out.push({ book: "kalshi", market: "spread", side: "home", line: strike, prob: r.noAsk, price: probToAmerican(r.noAsk), liquidity: r.liq, url: r.url }); }
    }
  }
  const totalsIdx = athlete ? -1 : cfg.hasSpread ? 2 : 1;
  if (totalsIdx > 0 && lists[totalsIdx]) {
    for (const m of lists[totalsIdx].filter((m) => eventMatchesGame(m.event_ticker, g))) {
      const strike = m.floor_strike;
      if (strike === undefined) continue;
      const r = take(m, "over", "total", strike);
      if (isFinite(r.noAsk) && r.noAsk > 0 && r.noAsk < 1) out.push({ book: "kalshi", market: "total", side: "under", line: strike, prob: r.noAsk, price: probToAmerican(r.noAsk), liquidity: r.liq, url: r.url });
    }
  }
  return out;
}

/* ---------------- Polymarket ---------------- */
const GAMMA = "https://gamma-api.polymarket.com";
interface PMarket { question?: string; outcomes?: string; outcomePrices?: string; sportsMarketType?: string; line?: number; spread?: number; liquidityNum?: number; volumeNum?: number; slug?: string; closed?: boolean; active?: boolean }
interface PEvent { slug: string; title: string; startDate?: string; markets?: PMarket[]; tags?: { slug: string }[] }

const POLY_LEAGUE_TAG: Record<string, string[]> = { nfl: ["nfl"], nba: ["nba"], mlb: ["mlb"], nhl: ["nhl"], ncaaf: ["cfb", "ncaaf", "college-football"], ncaab: ["cbb", "ncaab"], wnba: ["wnba"], epl: ["epl"], laliga: ["la-liga"], bundesliga: ["bundesliga"], seriea: ["serie-a"], ligue1: ["ligue-1"], ucl: ["ucl", "champions-league"], mls: ["mls"], ufc: ["ufc", "mma"], atp: ["tennis"], wta: ["tennis"] };

async function polymarketQuotes(sport: SportKey, g: ScoreboardGame): Promise<BookQuote[]> {
  const tags = POLY_LEAGUE_TAG[sport];
  if (!tags) return [];
  return cached(`poly:${sport}:${g.id}`, TTL.fiveMin, async () => {
    const q = encodeURIComponent(`${g.away.name} ${g.home.name}`);
    const s = await getJson<{ events?: PEvent[] }>(`${GAMMA}/public-search?q=${q}&limit_per_type=8`).catch(() => ({ events: [] as PEvent[] }));
    const gd = new Date(g.date).getTime();
    const ev = (s.events || []).find((e) => {
      const tagOk = (e.tags || []).some((t) => tags.includes(t.slug)) || tags.some((t) => e.slug.startsWith(`${t}-`));
      const dateOk = e.startDate ? Math.abs(new Date(e.startDate).getTime() - gd) < 3 * 86_400_000 || /vs\.?/.test(e.title) : true;
      const nameOk = labelMatches(e.title.split(/vs\.?/)[0], g.away) || labelMatches(e.title.split(/vs\.?/)[0], g.home);
      return tagOk && dateOk && nameOk && (e.markets || []).some((m) => m.sportsMarketType);
    });
    if (!ev) return [];
    const full = await getJson<PEvent[]>(`${GAMMA}/events?slug=${ev.slug}`).catch(() => [] as PEvent[]);
    const markets = full[0]?.markets || ev.markets || [];
    const out: BookQuote[] = [];
    const url = `https://polymarket.com/event/${ev.slug}`;
    for (const m of markets) {
      if (m.closed || !m.outcomes || !m.outcomePrices) continue;
      let outcomes: string[], prices: number[];
      try { outcomes = JSON.parse(m.outcomes); prices = (JSON.parse(m.outcomePrices) as string[]).map(Number); } catch { continue; }
      const half = (m.spread ?? 0.02) / 2;
      const liq = m.liquidityNum ?? 0;
      const push = (market: Market, side: Side, p: number, line?: number) => {
        const ask = Math.min(0.99, Math.max(0.01, p + half));
        out.push({ book: "polymarket", market, side, line, prob: ask, price: probToAmerican(ask), liquidity: liq, url });
      };
      if (m.sportsMarketType === "moneyline") {
        outcomes.forEach((o, i) => {
          if (/draw|tie/i.test(o)) push("moneyline", "draw", prices[i]);
          else { const sd = pickSide(o, g); if (sd) push("moneyline", sd, prices[i]); }
        });
      } else if (m.sportsMarketType === "spreads" && m.line !== undefined && SPORTS[sport].hasSpread) {
        const favIsHome = pickSide(outcomes[0], g) === "home";
        const homeLine = favIsHome ? m.line : -m.line;
        outcomes.forEach((o, i) => { const sd = pickSide(o, g); if (sd) push("spread", sd, prices[i], homeLine); });
      } else if (m.sportsMarketType === "totals" && m.line !== undefined && SPORTS[sport].hasTotal) {
        outcomes.forEach((o, i) => { if (/over/i.test(o)) push("total", "over", prices[i], m.line); else if (/under/i.test(o)) push("total", "under", prices[i], m.line); });
      }
    }
    return out;
  });
}

/* ---------------- aggregation ---------------- */
export async function quotesForGame(sport: SportKey, g: ScoreboardGame, dk?: MarketLines): Promise<BookQuote[]> {
  if (g.status === "final") return dkQuotes(dk);
  const [k, p] = await Promise.all([kalshiQuotes(sport, g).catch(() => [] as BookQuote[]), polymarketQuotes(sport, g).catch(() => [] as BookQuote[])]);
  return [...dkQuotes(dk), ...k, ...p];
}

export interface Consensus {
  home?: number; draw?: number; away?: number;
  spreadLine?: number; homeCover?: number;
  totalLine?: number; over?: number;
  books: BookId[];
}

/** De-vig each book separately (power method), then average in log-odds space with liquidity-aware weights. */
export function consensus(quotes: BookQuote[], dkSpread?: number, dkTotal?: number): Consensus {
  const books = [...new Set(quotes.map((q) => q.book))];
  const weight = (q: BookQuote) => (q.book === "draftkings" ? 1 : q.liquidity !== undefined && q.liquidity < 2000 ? 0.4 : 0.9);
  const avg = (pairs: { p: number; w: number }[]) => (pairs.length ? sigmoid(pairs.reduce((a, x) => a + x.w * logit(x.p), 0) / pairs.reduce((a, x) => a + x.w, 0)) : undefined);
  const c: Consensus = { books };
  const mlH: { p: number; w: number }[] = [], mlD: { p: number; w: number }[] = [], mlA: { p: number; w: number }[] = [];
  for (const b of books) {
    const h = quotes.find((q) => q.book === b && q.market === "moneyline" && q.side === "home");
    const a = quotes.find((q) => q.book === b && q.market === "moneyline" && q.side === "away");
    const d = quotes.find((q) => q.book === b && q.market === "moneyline" && q.side === "draw");
    if (!h || !a) continue;
    const fair = devigPower(d ? [h.prob, d.prob, a.prob] : [h.prob, a.prob]);
    mlH.push({ p: fair[0], w: weight(h) });
    if (d) { mlD.push({ p: fair[1], w: weight(h) }); mlA.push({ p: fair[2], w: weight(h) }); } else mlA.push({ p: fair[1], w: weight(h) });
  }
  c.home = avg(mlH); c.away = avg(mlA); c.draw = mlD.length ? avg(mlD) : undefined;
  if (c.home !== undefined && c.away !== undefined) { const s = c.home + (c.draw ?? 0) + c.away; c.home /= s; c.away /= s; if (c.draw !== undefined) c.draw /= s; }
  const spreadLine = dkSpread ?? mode(quotes.filter((q) => q.market === "spread").map((q) => q.line!));
  if (spreadLine !== undefined) {
    const pairs: { p: number; w: number }[] = [];
    for (const b of books) {
      const h = quotes.find((q) => q.book === b && q.market === "spread" && q.side === "home" && q.line === spreadLine);
      const a = quotes.find((q) => q.book === b && q.market === "spread" && q.side === "away" && q.line === spreadLine);
      if (h && a) pairs.push({ p: devigPower([h.prob, a.prob])[0], w: weight(h) });
    }
    c.spreadLine = spreadLine; c.homeCover = avg(pairs);
  }
  const totalLine = dkTotal ?? mode(quotes.filter((q) => q.market === "total").map((q) => q.line!));
  if (totalLine !== undefined) {
    const pairs: { p: number; w: number }[] = [];
    for (const b of books) {
      const o = quotes.find((q) => q.book === b && q.market === "total" && q.side === "over" && q.line === totalLine);
      const u = quotes.find((q) => q.book === b && q.market === "total" && q.side === "under" && q.line === totalLine);
      if (o && u) pairs.push({ p: devigPower([o.prob, u.prob])[0], w: weight(o) });
    }
    c.totalLine = totalLine; c.over = avg(pairs);
  }
  return c;
}

function mode(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const cnt = new Map<number, number>();
  for (const x of xs) cnt.set(x, (cnt.get(x) || 0) + 1);
  return [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Best price available for a side at a given line across books (lowest implied probability). */
export function bestQuote(quotes: BookQuote[], market: Market, side: Side, line?: number): BookQuote | undefined {
  const c = quotes.filter((q) => q.market === market && q.side === side && (line === undefined || q.line === line));
  if (!c.length) return undefined;
  return c.sort((a, b) => a.prob - b.prob)[0];
}
