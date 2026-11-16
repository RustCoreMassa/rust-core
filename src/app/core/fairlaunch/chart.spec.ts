import { candles, curvePrice, tradePrice } from './chart';
import { CURVE_TOKENS, CURVE_VIRTUAL_TOKENS, quoteBuy, quoteSell } from './curve';
import { Trade } from './records';

const MAS = 1_000_000_000n;
const TARGET = 200n * MAS;
const VIRTUAL = TARGET / 3n;
const T0 = Date.UTC(2026, 10, 16, 10, 0, 0);

/** Trades as the contract records them: replayed on the app's curve mirror. */
function replay(steps: { at: number; buy?: bigint; sell?: bigint }[]): Trade[] {
  let sold = 0n;
  let masIn = 0n;
  return steps.map((s) => {
    const curve = { virtualMas: VIRTUAL, masIn, sold };
    if (s.buy) {
      const q = quoteBuy(curve, s.buy);
      sold += q.tokens;
      masIn += q.mas;
      return {
        time: s.at,
        trader: 'AU1',
        isBuy: true,
        mas: q.mas,
        tokens: q.tokens,
        sold,
        masIn,
        opId: '',
      };
    }
    const mas = quoteSell(curve, s.sell!);
    sold -= s.sell!;
    masIn -= mas;
    return { time: s.at, trader: 'AU1', isBuy: false, mas, tokens: s.sell!, sold, masIn, opId: '' };
  });
}

describe('Fair Launch chart', () => {
  it('starts at the curve price and ends 16 times higher', () => {
    const start = curvePrice(VIRTUAL, 0n, 0n);
    expect(start).toBeCloseTo(200 / 3.2e9, 15);
    expect(curvePrice(VIRTUAL, TARGET, CURVE_TOKENS) / start).toBeCloseTo(16, 6);
    expect(Number(CURVE_VIRTUAL_TOKENS)).toBeGreaterThan(Number(CURVE_TOKENS));
  });

  it('puts the trades of an interval in one candle, joined to the previous one', () => {
    const trades = replay([
      { at: T0 + 5_000, buy: 1n * MAS },
      { at: T0 + 20_000, buy: 5n * MAS },
      { at: T0 + 50_000, sell: 10_000_000n * MAS },
      { at: T0 + 70_000, buy: 2n * MAS },
    ]);
    const c = candles(trades, VIRTUAL, 60, 'price');
    expect(c.length).toBe(2);
    expect(c[0].time).toBe(T0 / 1000);
    expect(c[0].open).toBe(curvePrice(VIRTUAL, 0n, 0n));
    expect(c[0].high).toBe(tradePrice(VIRTUAL, trades[1]));
    expect(c[0].close).toBe(tradePrice(VIRTUAL, trades[2]));
    expect(c[0].low).toBe(c[0].open);
    expect(c[0].buyMas).toBe(6n * MAS);
    expect(c[0].sellMas).toBe(trades[2].mas);
    expect(c[1].time).toBe(T0 / 1000 + 60);
    expect(c[1].open).toBe(c[0].close);
    expect(c[1].close).toBe(tradePrice(VIRTUAL, trades[3]));
  });

  it('shows the market cap as price × 1 B tokens', () => {
    const trades = replay([{ at: T0, buy: 1n * MAS }]);
    const [price] = candles(trades, VIRTUAL, 60, 'price');
    const [mcap] = candles(trades, VIRTUAL, 60, 'mcap');
    expect(mcap.close).toBeCloseTo(price.close * 1e9, 6);
  });

  it('leaves out intervals without trades', () => {
    const trades = replay([
      { at: T0, buy: 1n * MAS },
      { at: T0 + 3_600_000, buy: 1n * MAS },
    ]);
    expect(candles(trades, VIRTUAL, 60).map((c) => c.time)).toEqual([T0 / 1000, T0 / 1000 + 3_600]);
    expect(candles(trades, VIRTUAL, 86_400).length).toBe(1);
  });

  it('has no candles before the first trade', () => {
    expect(candles([], VIRTUAL, 60)).toEqual([]);
  });
});
