import { Args, ArrayTypes } from '@massalabs/massa-web3';

// Dusa (Massa's DEX, Liquidity Book, Core V2): the parts the Launchpad uses — read a token's MAS
// pools, create one, add liquidity. Formats from Dusa's SDK (@dusalabs/sdk 1.1.18) and its v1
// core contracts, checked against mainnet and buildnet reads. Pure functions: the app and the
// buildnet e2e script share them.

/** Bin ids are shifted by 2^23: bin 2^23 holds the price 1 (in smallest units). */
export const ID_SHIFT = 2 ** 23;
export const WMAS_DECIMALS = 9;
/** A liquidity distribution's shares add up to 1e18 per token. */
export const DISTRIBUTION_ONE = 10n ** 18n;

/** Storage the router charges for addLiquidity, as Dusa's SDK sends it: base + per bin. */
export function addLiquidityStorage(bins: number): bigint {
  return 140_100_000n + BigInt(bins) * 45_600_000n;
}

/**
 * MAS sent with createLBPair: the new pair contract's storage. The Factory refunds what it
 * doesn't use; e2e-dusa.ts measured 9.39 MAS on buildnet (2026-11-04).
 */
export const CREATE_PAIR_COINS = 12_000_000_000n;

/** Default price move a liquidity add accepts (amounts and active bin), in basis points. */
export const SLIPPAGE_BPS = 100;
/** How long a signed liquidity add stays valid (the router's deadline). */
export const DEADLINE_MS = 20 * 60_000;

export interface DusaPairInfo {
  binStep: number;
  pair: string;
  createdByOwner: boolean;
  blacklisted: boolean;
}

/** Factory.getAllLBPairs: LBPairInformation records back to back (u32, string, bool, bool). */
export function readPairList(bytes: Uint8Array): DusaPairInfo[] {
  const args = new Args(bytes);
  const pairs: DusaPairInfo[] = [];
  while (args.getOffset() < bytes.length) {
    pairs.push({
      binStep: Number(args.nextU32()),
      pair: args.nextString(),
      createdByOwner: args.nextBool(),
      blacklisted: args.nextBool(),
    });
  }
  return pairs;
}

export interface DusaPairState {
  activeId: number;
  reserveX: bigint;
  reserveY: bigint;
}

/** Pair.getPairInformation: active id (u32), then the reserves of X and Y (u256). */
export function readPairState(bytes: Uint8Array): DusaPairState {
  const args = new Args(bytes);
  return {
    activeId: Number(args.nextU32()),
    reserveX: args.nextU256(),
    reserveY: args.nextU256(),
  };
}

/** Y per X of bin `id`, in whole tokens: (1 + binStep/10 000)^(id − 2^23) × 10^(dx − dy). */
export function priceFromId(id: number, binStep: number, decimalsX: number, decimalsY: number) {
  return (1 + binStep / 10_000) ** (id - ID_SHIFT) * 10 ** (decimalsX - decimalsY);
}

/** The bin holding a price of Y per X in whole tokens (the nearest one); null for no price. */
export function idFromPrice(
  price: number,
  binStep: number,
  decimalsX: number,
  decimalsY: number,
): number | null {
  if (!(price > 0) || !Number.isFinite(price)) return null;
  const raw = price * 10 ** (decimalsY - decimalsX);
  const id = Math.round(Math.log(raw) / Math.log(1 + binStep / 10_000)) + ID_SHIFT;
  return id > 0 && id < 2 ** 24 ? id : null;
}

/** How many bins a price move of `bps` spans (at least 1). */
export function idSlippage(bps: number, binStep: number): number {
  return Math.max(1, Math.floor(Math.log(1 + bps / 10_000) / Math.log(1 + binStep / 10_000)));
}

/** How wide the liquidity goes on each side of the price, in bins. */
export type LiquidityShape = 'narrow' | 'wide';
export const SHAPE_BINS: Readonly<Record<LiquidityShape, number>> = { narrow: 5, wide: 25 };

export interface Distribution {
  /** Bins relative to the active one. */
  deltaIds: number[];
  /** Share of the X amount (the token) per bin, out of 1e18. */
  distributionX: bigint[];
  /** Share of the Y amount (MAS) per bin, out of 1e18. */
  distributionY: bigint[];
}

/**
 * Spread evenly over `n` bins on each side, Dusa's "spot" shape: the token in the active bin and
 * above it (sold as the price rises), MAS in the active bin and below it (buys as it falls); the
 * active bin takes half a share of each. Each side adds up to exactly 1e18.
 */
export function uniformDistribution(n: number): Distribution {
  const deltaIds = Array.from({ length: 2 * n + 1 }, (_, i) => i - n);
  const parts = BigInt(2 * n + 1);
  const share = DISTRIBUTION_ONE / parts;
  const side = (delta: number) => (delta === 0 ? share : 2n * share);
  const distributionX = deltaIds.map((d) => (d < 0 ? 0n : side(d)));
  const distributionY = deltaIds.map((d) => (d > 0 ? 0n : side(d)));
  // Rounding dust to the outermost bins, so each side is exactly 1e18.
  distributionX[2 * n] += DISTRIBUTION_ONE - distributionX.reduce((a, b) => a + b, 0n);
  distributionY[0] += DISTRIBUTION_ONE - distributionY.reduce((a, b) => a + b, 0n);
  return { deltaIds, distributionX, distributionY };
}

/** createLBPair(tokenX, tokenY = WMAS, activeId, binStep) on the router. */
export function createPairArgs(token: string, wmas: string, activeId: number, binStep: number) {
  return new Args()
    .addString(token)
    .addString(wmas)
    .addU32(BigInt(activeId))
    .addU32(BigInt(binStep));
}

export interface AddLiquidity {
  token: string;
  wmas: string;
  binStep: number;
  /** Token amount, smallest units. */
  tokenAmount: bigint;
  /** nanoMAS. */
  masAmount: bigint;
  /** The bin the price should be in; the add fails if it moved more than `idSlippage` bins. */
  activeId: number;
  idSlippage: number;
  distribution: Distribution;
  /** Who receives the liquidity position. */
  to: string;
  /** Milliseconds since the epoch. */
  deadline: number;
  /** Accepted shortfall on each amount, in basis points. */
  slippageBps: number;
}

/** Below `amount` by `bps` basis points (the least the router may take). */
export function minimum(amount: bigint, bps: number): bigint {
  return (amount * BigInt(10_000 - bps)) / 10_000n;
}

/**
 * addLiquidityMAS on the router: the same arguments as Dusa's SDK, with the storage cost last
 * (sent on top of the MAS amount).
 */
export function addLiquidityCall(p: AddLiquidity): { args: Args; coins: bigint } {
  const storage = addLiquidityStorage(p.distribution.deltaIds.length);
  const args = new Args()
    .addString(p.token)
    .addString(p.wmas)
    .addU64(BigInt(p.binStep))
    .addU256(p.tokenAmount)
    .addU256(p.masAmount)
    .addU256(minimum(p.tokenAmount, p.slippageBps))
    .addU256(minimum(p.masAmount, p.slippageBps))
    .addU64(BigInt(p.activeId))
    .addU64(BigInt(p.idSlippage))
    .addArray(p.distribution.deltaIds.map(BigInt), ArrayTypes.I64)
    .addArray(p.distribution.distributionX, ArrayTypes.U256)
    .addArray(p.distribution.distributionY, ArrayTypes.U256)
    .addString(p.to)
    .addU64(BigInt(p.deadline))
    .addU64(storage);
  return { args, coins: storage + p.masAmount };
}

/** Dusa's page for a pool (its app route /pools/:token0/:token1/:binStep/:version). */
export function poolUrl(appUrl: string, tokenX: string, tokenY: string, binStep: number): string {
  return `${appUrl}/pools/${tokenX}/${tokenY}/${binStep}/V2`;
}

/** Above this gap between a pool's price and the owner's reference price, the app warns. */
export const PRICE_GAP_WARN = 0.1;

/**
 * Why adding to an existing pool needs a second look, or null. Anyone can create a token's pool
 * at any price (one pool per bin step), e.g. while its presale runs: liquidity added "around the
 * current price" of such a pool sells the token at the creator's price. `reference`: the price
 * the owner expects (their presale's), 0 when unknown.
 */
export function poolPriceWarning(
  pool: { price: number; tokenReserve: bigint; masReserve: bigint },
  reference: number,
): string | null {
  if (reference > 0) {
    const gap = pool.price / reference - 1;
    if (Math.abs(gap) > PRICE_GAP_WARN)
      return (
        `This pool's price is ${Math.round(Math.abs(gap) * 100)}% ` +
        `${gap > 0 ? 'above' : 'below'} your presale's price (${formatPrice(reference)} MAS). ` +
        'Anyone can create a pool at any price: if this one is wrong, pick another bin step.'
      );
  }
  if (pool.tokenReserve === 0n && pool.masReserve === 0n)
    return (
      'Nobody has added liquidity to this pool yet: its price was set by whoever created it, ' +
      'maybe not you. Check it before adding.'
    );
  return null;
}

/** A presale's price in MAS per whole token: rate = smallest token units per 1 MAS. */
export function presalePrice(rate: bigint, decimals: number): number {
  return rate > 0n ? 10 ** decimals / Number(rate) : 0;
}

/** A price for people: 4 significant digits, no exponent ("0.0001234", "1,250"). */
export function formatPrice(price: number): string {
  if (!(price > 0) || !Number.isFinite(price)) return '—';
  if (price >= 1) return price.toLocaleString('en-US', { maximumSignificantDigits: 4 });
  const digits = Math.min(20, Math.max(0, 3 - Math.floor(Math.log10(price))));
  return price.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
}
