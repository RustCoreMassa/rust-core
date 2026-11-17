import { u128, u256 } from 'as-bignum/assembly';
import {
  CURVE_TOKENS,
  CURVE_VIRTUAL_TOKENS,
  ID_SHIFT,
  POOL_TOKENS,
  TOTAL_SUPPLY,
  binForPrice,
  feeOf,
  priceQ64,
  quoteBuy,
  quoteSell,
  virtualMasFor,
} from '../lib/fairlaunch/curve';

const MAS: u64 = 1_000_000_000;
const TARGET: u64 = 20_000 * MAS;
const V: u64 = virtualMasFor(TARGET);

/** r^n in Q64.64 by plain repeated multiplication (the slow, obvious way). */
function slowPow(binStep: u32, n: i32): u128 {
  const one = new u128(0, 1);
  let value = one;
  const num = u128.fromU64(10_000);
  const den = u128.fromU64(10_000 + u64(binStep));
  for (let i = 0; i < n; i++) {
    value = (u256.fromU128(value) * u256.fromU128(num)).toU128() / den;
  }
  return value;
}

describe('Supply split', () => {
  test('1 B tokens: 800 M on the curve, 200 M for the pool', () => {
    expect(TOTAL_SUPPLY).toBe(1_000_000_000 * MAS);
    expect(CURVE_TOKENS).toBe(800_000_000 * MAS);
    expect(POOL_TOKENS).toBe(200_000_000 * MAS);
    expect(CURVE_VIRTUAL_TOKENS > CURVE_TOKENS).toBe(true);
  });
});

describe('Bonding curve', () => {
  test('selling out the curve raises the target', () => {
    const q = quoteBuy(V, 0, 0, 1_000_000 * MAS);
    expect(q.tokens).toBe(CURVE_TOKENS);
    // Within 0.0001 % of the target (the virtual reserve is target / 3, rounded down).
    const diff = q.mas > TARGET ? q.mas - TARGET : TARGET - q.mas;
    expect(diff < TARGET / 1_000_000).toBe(true);
  });

  test('the price rises with each buy', () => {
    const first = quoteBuy(V, 0, 0, 100 * MAS);
    const second = quoteBuy(V, first.mas, first.tokens, 100 * MAS);
    expect(second.tokens < first.tokens).toBe(true);
    expect(first.mas).toBe(100 * MAS);
  });

  test('many small buys never get more than one big buy', () => {
    let sold: u64 = 0;
    let masIn: u64 = 0;
    for (let i = 0; i < 50; i++) {
      const q = quoteBuy(V, masIn, sold, 10 * MAS);
      sold += q.tokens;
      masIn += q.mas;
    }
    const big = quoteBuy(V, 0, 0, 500 * MAS);
    expect(masIn).toBe(500 * MAS);
    expect(sold <= big.tokens).toBe(true);
  });

  test('buying then selling back returns at most what was paid', () => {
    const q = quoteBuy(V, 0, 0, 777 * MAS);
    const back = quoteSell(V, q.mas, q.tokens, q.tokens);
    expect(back <= q.mas).toBe(true);
    expect(back > q.mas - 10).toBe(true); // only rounding is lost
  });

  test('the last buy pays only for what is left', () => {
    const almost = quoteBuy(V, 0, 0, TARGET - 10 * MAS);
    const last = quoteBuy(V, almost.mas, almost.tokens, 1_000 * MAS);
    expect(almost.tokens + last.tokens).toBe(CURVE_TOKENS);
    expect(last.mas < 11 * MAS).toBe(true);
    expect(last.mas > 9 * MAS).toBe(true);
  });

  test('nothing for nothing, nothing after the sell-out', () => {
    expect(quoteBuy(V, 0, 0, 0).tokens).toBe(0);
    expect(quoteBuy(V, TARGET, CURVE_TOKENS, MAS).tokens).toBe(0);
    expect(quoteSell(V, 0, 0, 0)).toBe(0);
  });

  test('a sell never pays more than the curve holds', () => {
    const q = quoteBuy(V, 0, 0, 3 * MAS);
    expect(quoteSell(V, q.mas, q.tokens, q.tokens) <= q.mas).toBe(true);
  });

  throws('selling more than the curve sold', () => {
    quoteSell(V, MAS, 1_000, 1_001);
  });

  test('fees in basis points, rounded down', () => {
    expect(feeOf(1_000 * MAS, 100)).toBe(10 * MAS);
    expect(feeOf(199, 100)).toBe(1);
    expect(feeOf(1_000, 0)).toBe(0);
  });
});

describe('Dusa bin of a price', () => {
  test('the bin price is at most the price, and the next bin above it', () => {
    const steps: u32[] = [20, 25, 50, 100];
    for (let s = 0; s < steps.length; s++) {
      const step = steps[s];
      const mas = 19_000 * MAS;
      const id = binForPrice(mas, POOL_TOKENS, step);
      const n = i32(ID_SHIFT - id);
      const price = priceQ64(mas, POOL_TOKENS);
      expect(slowPow(step, n) <= price).toBe(true);
      expect(slowPow(step, n - 1) > price).toBe(true);
    }
  });

  test('cheaper prices sit in lower bins', () => {
    const high = binForPrice(50_000 * MAS, POOL_TOKENS, 100);
    const low = binForPrice(500 * MAS, POOL_TOKENS, 100);
    expect(low < high).toBe(true);
    expect(high < ID_SHIFT).toBe(true);
  });

  throws('a price of 1 MAS per token or more', () => {
    binForPrice(POOL_TOKENS, POOL_TOKENS, 100);
  });
});
