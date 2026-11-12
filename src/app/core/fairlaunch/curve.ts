import { Launch, STATE_TRADING } from './records';

/**
 * Mirror of the Fair Launch curve (smart-contract/assembly/lib/fairlaunch/curve.ts), in bigint,
 * to explain prices before a trade. The contract decides: every trade is simulated first, and
 * its minimum (slippage) protects the rest.
 */

export const TOKEN_DECIMALS = 9;
const UNIT = 10n ** 9n;
export const TOTAL_SUPPLY = 1_000_000_000n * UNIT;
export const CURVE_TOKENS = 800_000_000n * UNIT;
export const POOL_TOKENS = TOTAL_SUPPLY - CURVE_TOKENS;
export const CURVE_VIRTUAL_TOKENS = (CURVE_TOKENS / 3n) * 4n;
const BPS_ALL = 10_000n;

/** Coins sent with a trade on top of the amount: 0.01 MAS for the token transfer + margin. */
export const TRADE_MARGIN = 50_000_000n; // 0.05 MAS, the unused part comes back
/**
 * Sent with graduate(): the reserve in the curve pays the pool; this margin only covers Dusa
 * using more storage than estimated, and comes back with what the reserve didn't use.
 */
export const GRADUATE_COINS = 1_000_000_000n; // 1 MAS
/** Sent with createLaunch on top of the fee, the deposit and a dev buy: storage of the launch. */
export const CREATE_MARGIN = 1_000_000_000n; // 1 MAS, the unused part comes back

export function feeOf(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / BPS_ALL;
}

export interface BuyQuote {
  tokens: bigint;
  /** nanoMAS the curve takes: what was offered, or less for the last tokens. */
  mas: bigint;
}

export function quoteBuy(l: Pick<Launch, 'virtualMas' | 'masIn' | 'sold'>, mas: bigint): BuyQuote {
  if (mas <= 0n || l.sold >= CURVE_TOKENS) return { tokens: 0n, mas: 0n };
  const x = l.virtualMas + l.masIn;
  const y = CURVE_VIRTUAL_TOKENS - l.sold;
  let tokens = (y * mas) / (x + mas);
  const left = CURVE_TOKENS - l.sold;
  if (tokens >= left) {
    tokens = left;
    const product = x * left;
    const d = y - left;
    mas = product / d + (product % d === 0n ? 0n : 1n);
  }
  return { tokens, mas };
}

/** nanoMAS before the fee for selling `tokens` back. */
export function quoteSell(
  l: Pick<Launch, 'virtualMas' | 'masIn' | 'sold'>,
  tokens: bigint,
): bigint {
  if (tokens <= 0n || tokens > l.sold) return 0n;
  const x = l.virtualMas + l.masIn;
  const y = CURVE_VIRTUAL_TOKENS - l.sold;
  const out = (x * tokens) / (y + tokens);
  return out > l.masIn ? l.masIn : out;
}

/** The curve's current price, MAS per whole token (both have 9 decimals). */
export function spotPrice(l: Pick<Launch, 'virtualMas' | 'masIn' | 'sold'>): number {
  const x = Number(l.virtualMas + l.masIn);
  const y = Number(CURVE_VIRTUAL_TOKENS - l.sold);
  return y > 0 ? x / y : 0;
}

/** Market cap at the current price, in MAS. */
export function marketCap(l: Pick<Launch, 'virtualMas' | 'masIn' | 'sold'>): number {
  return spotPrice(l) * Number(TOTAL_SUPPLY / UNIT);
}

/** Share of the curve sold, 0–100. */
export function progress(l: Pick<Launch, 'sold'>): number {
  return Number((l.sold * 10_000n) / CURVE_TOKENS) / 100;
}

/** Below `amount` by `bps` basis points: the least a trade accepts. */
export function withSlippage(amount: bigint, bps: number): bigint {
  return (amount * (BPS_ALL - BigInt(bps))) / BPS_ALL;
}

export const DEFAULT_SLIPPAGE_BPS = 200; // 2 %

export type LaunchPhase = 'trading' | 'complete' | 'graduated';

export function launchPhase(l: Pick<Launch, 'state'>): LaunchPhase {
  if (l.state === STATE_TRADING) return 'trading';
  return l.state === 1 ? 'complete' : 'graduated';
}

export const PHASE_LABELS: Readonly<Record<LaunchPhase, string>> = {
  trading: 'On the curve',
  complete: 'Moving to Dusa',
  graduated: 'On Dusa',
};

/** Coins for a buy of `mas`: the amount, its fee and the margin. */
export function buyCoins(mas: bigint, feeBps: number): bigint {
  return mas + feeOf(mas, feeBps) + TRADE_MARGIN;
}
