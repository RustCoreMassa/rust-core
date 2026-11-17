import { CURVE_VIRTUAL_TOKENS, TOTAL_SUPPLY } from './curve';
import { Trade } from './records';

/**
 * The price chart of a fair launch, built from the trade history the contract keeps (getTrades):
 * no indexer. Each trade stores the curve after it, so every price is exact.
 */

export interface ChartInterval {
  label: string;
  seconds: number;
}

export const CHART_INTERVALS: readonly ChartInterval[] = [
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3_600 },
  { label: '1D', seconds: 86_400 },
];

/** What the chart shows: market cap (price × 1 B tokens, as pump-style charts do) or price. */
export type ChartValue = 'mcap' | 'price';

/** Whole tokens in the supply: market cap = price × this. */
const SUPPLY_TOKENS = Number(TOTAL_SUPPLY / 1_000_000_000n);

/** MAS per whole token for a curve state (token and MAS both have 9 decimals). */
export function curvePrice(virtualMas: bigint, masIn: bigint, sold: bigint): number {
  return Number(virtualMas + masIn) / Number(CURVE_VIRTUAL_TOKENS - sold);
}

export function chartScale(value: ChartValue): number {
  return value === 'mcap' ? SUPPLY_TOKENS : 1;
}

export interface Candle {
  /** Start of the interval, seconds since the epoch (UTC). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** nanoMAS bought and sold in the interval (before fees). */
  buyMas: bigint;
  sellMas: bigint;
}

/**
 * OHLC candles of `trades` (oldest first), `seconds` long, in MAS (price) or MAS × supply
 * (market cap). Each candle opens where the previous trade left the price — the first one at the
 * curve's starting price — so the candles join up. Intervals without trades have no candle.
 */
export function candles(
  trades: readonly Trade[],
  virtualMas: bigint,
  seconds: number,
  value: ChartValue = 'mcap',
): Candle[] {
  const scale = chartScale(value);
  const out: Candle[] = [];
  let last = curvePrice(virtualMas, 0n, 0n) * scale;
  for (const t of trades) {
    const time = Math.floor(t.time / 1000 / seconds) * seconds;
    const price = curvePrice(virtualMas, t.masIn, t.sold) * scale;
    let c = out.at(-1);
    if (!c || c.time !== time) {
      c = { time, open: last, high: last, low: last, close: last, buyMas: 0n, sellMas: 0n };
      out.push(c);
    }
    c.high = Math.max(c.high, price);
    c.low = Math.min(c.low, price);
    c.close = price;
    if (t.isBuy) c.buyMas += t.mas;
    else c.sellMas += t.mas;
    last = price;
  }
  return out;
}

/** The price a trade left, in MAS per token. */
export function tradePrice(virtualMas: bigint, t: Trade): number {
  return curvePrice(virtualMas, t.masIn, t.sold);
}
