// The bonding curve of a fair launch, and the Dusa bin of its final price. Pure integer math
// (no floats in Massa contracts), shared by the contract and its tests.
//
// Every fair-launch token has the same supply: 1 000 000 000 tokens with 9 decimals (like MAS),
// 10^18 smallest units, which fit a u64. The curve sells 800 M of them; the last 200 M go to the
// Dusa pool with the MAS raised when the curve sells out ("graduation").
//
// Constant product with virtual reserves (x · y = k), as pump.fun does:
//   x = virtualMas + MAS in the curve,  y = CURVE_VIRTUAL_TOKENS − tokens sold.
// With virtualMas = target / 3 and CURVE_VIRTUAL_TOKENS = 4/3 × CURVE_TOKENS, selling all of
// CURVE_TOKENS brings in exactly `target` MAS and ends at a price of 4 × virtualMas /
// (CURVE_VIRTUAL_TOKENS / 4) per unit — the price the 200 M tokens and ~`target` MAS then give the
// pool (a little lower, since the graduation fee and costs come out of the MAS first).
import { u128, u256 } from 'as-bignum/assembly';

export const TOKEN_DECIMALS: u8 = 9;
/** 1 000 000 000 tokens, smallest units. */
export const TOTAL_SUPPLY: u64 = 1_000_000_000_000_000_000;
/** Sold by the curve: 800 000 000 tokens. */
export const CURVE_TOKENS: u64 = 800_000_000_000_000_000;
/** Paired with the raised MAS on Dusa at graduation: 200 000 000 tokens. */
export const POOL_TOKENS: u64 = TOTAL_SUPPLY - CURVE_TOKENS;
/** The curve's virtual token reserve: 4/3 of what it sells. */
export const CURVE_VIRTUAL_TOKENS: u64 = (CURVE_TOKENS / 3) * 4;
export const BPS_ALL: u64 = 10_000;

/** The virtual MAS reserve that makes selling CURVE_TOKENS bring in `target` nanoMAS. */
export function virtualMasFor(target: u64): u64 {
  return target / 3;
}

function mulDiv(a: u64, b: u64, d: u64): u64 {
  return u128.muldiv(u128.fromU64(a), u128.fromU64(b), u128.fromU64(d)).toU64();
}

function mulDivUp(a: u64, b: u64, d: u64): u64 {
  const product = u128.fromU64(a) * u128.fromU64(b);
  const q = product / u128.fromU64(d);
  return q * u128.fromU64(d) == product ? q.toU64() : q.toU64() + 1;
}

/** A buy's outcome: tokens out and the MAS the curve takes (≤ what was offered). */
export class BuyQuote {
  constructor(
    public tokens: u64 = 0,
    public mas: u64 = 0,
  ) {}
}

/**
 * Tokens for `mas` nanoMAS (fee already taken), rounded down. Capped at what the curve still
 * sells: then `mas` is only what those last tokens cost (rounded up), the caller refunds the rest.
 */
export function quoteBuy(virtualMas: u64, masIn: u64, sold: u64, mas: u64): BuyQuote {
  if (mas == 0 || sold >= CURVE_TOKENS) return new BuyQuote();
  const x = virtualMas + masIn;
  const y = CURVE_VIRTUAL_TOKENS - sold;
  let tokens = mulDiv(y, mas, x + mas);
  const left = CURVE_TOKENS - sold;
  if (tokens >= left) {
    tokens = left;
    // The MAS that buys exactly `left`: x · left / (y − left), rounded up.
    mas = mulDivUp(x, left, y - left);
  }
  return new BuyQuote(tokens, mas);
}

/** nanoMAS out for selling `tokens` back (fee not yet taken), rounded down. */
export function quoteSell(virtualMas: u64, masIn: u64, sold: u64, tokens: u64): u64 {
  if (tokens == 0) return 0;
  assert(tokens <= sold, 'More than the curve has sold');
  const x = virtualMas + masIn;
  const y = CURVE_VIRTUAL_TOKENS - sold;
  const out = mulDiv(x, tokens, y + tokens);
  // Rounding always favours the curve, so it can't pay out more than it holds; checked anyway.
  return out > masIn ? masIn : out;
}

/** `amount` × bps / 10 000, rounded down. */
export function feeOf(amount: u64, bps: u16): u64 {
  return mulDiv(amount, u64(bps), BPS_ALL);
}

// ---------------------------------------------------------------------------------------------
// Dusa bins. A Liquidity Book bin `id` holds the price (1 + binStep / 10 000)^(id − 2^23), in
// smallest units of Y (WMAS) per smallest unit of X (the token). Token and MAS both have 9
// decimals, so that is also MAS per token.

export const ID_SHIFT: u32 = 1 << 23;
/** 1.0 in Q64.64. */
const ONE_Q64: u128 = new u128(0, 1);

/**
 * a × b in Q64.64 fixed point: the 256-bit product shifted right by 64 bits, i.e. its two middle
 * limbs. (as-bignum's u256 `>> 64` is a no-op: wasm shifts are taken modulo 64.) Both factors
 * are below 2, so the result fits.
 */
function mulQ64(a: u128, b: u128): u128 {
  const product = u256.fromU128(a) * u256.fromU128(b);
  return new u128(product.lo2, product.hi1);
}

/** mas / tokens as Q64.64. */
export function priceQ64(mas: u64, tokens: u64): u128 {
  assert(tokens > 0, 'No tokens');
  return (u128.fromU64(mas) << 64) / u128.fromU64(tokens);
}

/**
 * The highest bin whose price is at most `mas / tokens` (a price below 1, as every fair launch
 * has: at most 0.5 MAS per token). Binary lifting over the powers r^(2^j), r = 1 / (1 + step).
 */
export function binForPrice(mas: u64, tokens: u64, binStep: u32): u32 {
  const price = priceQ64(mas, tokens);
  assert(price > u128.Zero && price < ONE_Q64, 'Price out of range');
  const inv = (ONE_Q64 * u128.fromU64(BPS_ALL)) / u128.fromU64(BPS_ALL + u64(binStep));
  const powers = new Array<u128>(24);
  powers[0] = inv;
  for (let j = 1; j < 24; j++) powers[j] = mulQ64(powers[j - 1], powers[j - 1]);
  // Largest k with r^k > price; then r^(k+1) ≤ price.
  let value = ONE_Q64;
  let k: u32 = 0;
  for (let j = 23; j >= 0; j--) {
    const candidate = mulQ64(value, powers[j]);
    if (candidate > price) {
      value = candidate;
      k += u32(1) << u32(j);
    }
  }
  assert(k + 1 < ID_SHIFT, 'Price out of range');
  return ID_SHIFT - (k + 1);
}
