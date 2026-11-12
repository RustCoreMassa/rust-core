import {
  CURVE_TOKENS,
  TRADE_MARGIN,
  buyCoins,
  feeOf,
  launchPhase,
  marketCap,
  progress,
  quoteBuy,
  quoteSell,
  spotPrice,
  withSlippage,
} from './curve';

const MAS = 1_000_000_000n;
const TARGET = 20_000n * MAS;
const fresh = { virtualMas: TARGET / 3n, masIn: 0n, sold: 0n };

describe('Fair Launch curve (mirror of the contract)', () => {
  it('sells out the curve for the target', () => {
    const q = quoteBuy(fresh, 1_000_000n * MAS);
    expect(q.tokens).toBe(CURVE_TOKENS);
    const diff = q.mas > TARGET ? q.mas - TARGET : TARGET - q.mas;
    expect(diff < TARGET / 1_000_000n).toBe(true);
  });

  it('raises the price with each buy', () => {
    const first = quoteBuy(fresh, 100n * MAS);
    const after = { ...fresh, masIn: first.mas, sold: first.tokens };
    expect(quoteBuy(after, 100n * MAS).tokens < first.tokens).toBe(true);
    expect(spotPrice(after) > spotPrice(fresh)).toBe(true);
  });

  it('gives back at most what was paid', () => {
    const q = quoteBuy(fresh, 777n * MAS);
    const back = quoteSell({ ...fresh, masIn: q.mas, sold: q.tokens }, q.tokens);
    expect(back <= q.mas).toBe(true);
    expect(back > q.mas - 10n).toBe(true);
  });

  it('refuses selling more than the curve sold', () => {
    expect(quoteSell({ ...fresh, masIn: MAS, sold: 1_000n }, 1_001n)).toBe(0n);
  });

  it('starts at a market cap of a quarter of the target', () => {
    // virtualMas / (4/3 × 800 M) per token × 1 B tokens = target / 3 × 1.07… ≈ 6 250 MAS here.
    expect(Math.round(marketCap(fresh))).toBe(6_250);
  });

  it('reports progress and phase', () => {
    expect(progress({ sold: CURVE_TOKENS / 4n })).toBe(25);
    expect(launchPhase({ state: 0 })).toBe('trading');
    expect(launchPhase({ state: 1 })).toBe('complete');
    expect(launchPhase({ state: 2 })).toBe('graduated');
  });

  it('computes fees, slippage and coins exactly', () => {
    expect(feeOf(1_000n * MAS, 100)).toBe(10n * MAS);
    expect(withSlippage(10_000n, 200)).toBe(9_800n);
    expect(buyCoins(100n * MAS, 100)).toBe(101n * MAS + TRADE_MARGIN);
  });
});
