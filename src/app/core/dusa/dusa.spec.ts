import { Args, ArrayTypes } from '@massalabs/massa-web3';
import {
  DISTRIBUTION_ONE,
  ID_SHIFT,
  addLiquidityCall,
  addLiquidityStorage,
  baseFeeBps,
  createPairArgs,
  formatPrice,
  idFromPrice,
  idSlippage,
  lpFeeText,
  minimum,
  poolPriceWarning,
  poolUrl,
  presalePrice,
  priceFromId,
  readFees,
  readPairList,
  readPairState,
  storageEstimate,
  uniformDistribution,
} from './dusa';

const TOKEN = 'AS12EeiTKsM4Akc8E7dGjQivyJZER8ytXKGzE384ZvmxpdY8uDTB4';
const WMAS = 'AS12U4TZfNK7qoLyEERBBRDMu8nm5MKoRzPXDXans4v9wdATZedz9';
const ME = 'AU126s93ZxbT4QUJcZYqsAxyMc3wv8nkHJYKYCtgQyEnZ8VGRM99P';

describe('Dusa reads', () => {
  it('decodes getAllLBPairs: records back to back', () => {
    const bytes = new Args()
      .addU32(20n)
      .addString('AS1pairA')
      .addBool(true)
      .addBool(false)
      .addU32(100n)
      .addString('AS1pairB')
      .addBool(false)
      .addBool(true)
      .serialize();
    expect(readPairList(bytes)).toEqual([
      { binStep: 20, pair: 'AS1pairA', createdByOwner: true, blacklisted: false },
      { binStep: 100, pair: 'AS1pairB', createdByOwner: false, blacklisted: true },
    ]);
    expect(readPairList(new Uint8Array())).toEqual([]);
  });

  it('decodes getPairInformation: active id, then reserves', () => {
    const bytes = new Args()
      .addU32(8_377_049n)
      .addU256(1_124_620_440_282_136_547_395_891n)
      .addU256(8_998_935_912_418n)
      .addU256(0n)
      .addU256(0n)
      .serialize();
    expect(readPairState(bytes)).toEqual({
      activeId: 8_377_049,
      reserveX: 1_124_620_440_282_136_547_395_891n,
      reserveY: 8_998_935_912_418n,
    });
  });
});

describe('Dusa prices', () => {
  it('has the price 1 (smallest units) at 2^23', () => {
    expect(priceFromId(ID_SHIFT, 25, 9, 9)).toBe(1);
    expect(priceFromId(ID_SHIFT + 1, 100, 9, 9)).toBeCloseTo(1.01, 12);
    // A token of 18 decimals at raw price 1: 1 whole token = 1e9 MAS.
    expect(priceFromId(ID_SHIFT, 20, 18, 9)).toBe(1e9);
  });

  it('turns a price into the nearest bin and back', () => {
    for (const [price, step, decimals] of [
      [0.001, 20, 9],
      [0.0000042, 100, 18],
      [1250, 25, 6],
    ] as const) {
      const id = idFromPrice(price, step, decimals, 9)!;
      const back = priceFromId(id, step, decimals, 9);
      expect(Math.abs(back / price - 1)).toBeLessThan(step / 20_000 + 1e-9); // half a bin
    }
  });

  it('refuses prices it can’t place', () => {
    expect(idFromPrice(0, 20, 9, 9)).toBeNull();
    expect(idFromPrice(-1, 20, 9, 9)).toBeNull();
    expect(idFromPrice(Number.NaN, 20, 9, 9)).toBeNull();
    expect(idFromPrice(Infinity, 20, 9, 9)).toBeNull();
  });

  it('counts the bins of a price move', () => {
    expect(idSlippage(100, 20)).toBe(4); // 1% over 0.2% bins
    expect(idSlippage(100, 100)).toBe(1);
    expect(idSlippage(10, 100)).toBe(1); // at least one
  });

  it('reads a presale price: rate = smallest units per MAS', () => {
    expect(presalePrice(1_000n * 10n ** 9n, 9)).toBe(0.001); // 1000 tokens per MAS
    expect(presalePrice(0n, 9)).toBe(0);
  });

  it('formats prices for people', () => {
    expect(formatPrice(0.00012346)).toBe('0.0001235');
    expect(formatPrice(0.5)).toBe('0.5');
    expect(formatPrice(1234.5)).toBe('1,235');
    expect(formatPrice(0)).toBe('—');
  });
});

describe('Dusa liquidity', () => {
  it('spreads each side evenly, the active bin taking half a share, to exactly 1e18', () => {
    const d = uniformDistribution(5);
    expect(d.deltaIds).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
    const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
    expect(sum(d.distributionX)).toBe(DISTRIBUTION_ONE);
    expect(sum(d.distributionY)).toBe(DISTRIBUTION_ONE);
    expect(d.distributionX.slice(0, 5).every((x) => x === 0n)).toBe(true);
    expect(d.distributionY.slice(6).every((y) => y === 0n)).toBe(true);
    expect(d.distributionX[6]).toBe(2n * d.distributionX[5]);
    expect(uniformDistribution(25).deltaIds).toHaveLength(51);
  });

  it('builds createLBPair with the token as X and WMAS as Y', () => {
    const args = new Args(createPairArgs(TOKEN, WMAS, 8_388_000, 25).serialize());
    expect(args.nextString()).toBe(TOKEN);
    expect(args.nextString()).toBe(WMAS);
    expect(args.nextU32()).toBe(8_388_000n);
    expect(args.nextU32()).toBe(25n);
  });

  it('builds addLiquidityMAS in the router’s order, storage last and sent with the MAS', () => {
    const distribution = uniformDistribution(5);
    const { args, coins } = addLiquidityCall({
      token: TOKEN,
      wmas: WMAS,
      binStep: 25,
      tokenAmount: 1_000_000n,
      masAmount: 5_000_000_000n,
      activeId: 8_388_000,
      idSlippage: 4,
      distribution,
      to: ME,
      deadline: 1_762_000_000_000,
      slippageBps: 100,
    });
    const storage = addLiquidityStorage(11);
    expect(storageEstimate(11)).toBe(140_100_000n + 11n * 45_600_000n);
    expect(storage).toBe((storageEstimate(11) * 6n) / 5n); // 20 % over the SDK's estimate
    expect(coins).toBe(storage + 5_000_000_000n);
    // Read back the way Dusa's SDK decodes it (decodeLiquidityTx).
    const read = new Args(args.serialize());
    expect(read.nextString()).toBe(TOKEN);
    expect(read.nextString()).toBe(WMAS);
    expect(read.nextU64()).toBe(25n);
    expect(read.nextU256()).toBe(1_000_000n);
    expect(read.nextU256()).toBe(5_000_000_000n);
    expect(read.nextU256()).toBe(990_000n);
    expect(read.nextU256()).toBe(4_950_000_000n);
    expect(read.nextU64()).toBe(8_388_000n);
    expect(read.nextU64()).toBe(4n);
    expect(read.nextArray(ArrayTypes.I64)).toEqual(distribution.deltaIds.map(BigInt));
    expect(read.nextArray(ArrayTypes.U256)).toEqual(distribution.distributionX);
    expect(read.nextArray(ArrayTypes.U256)).toEqual(distribution.distributionY);
    expect(read.nextString()).toBe(ME);
    expect(read.nextU64()).toBe(1_762_000_000_000n);
    expect(read.nextU64()).toBe(storage);
  });

  it('takes the slippage off an amount', () => {
    expect(minimum(10_000n, 100)).toBe(9_900n);
    expect(minimum(0n, 100)).toBe(0n);
  });

  it('links to the pool on Dusa', () => {
    expect(poolUrl('https://app.dusa.io', TOKEN, WMAS, 25)).toBe(
      `https://app.dusa.io/pools/${TOKEN}/${WMAS}/25/V2`,
    );
  });
});

describe('poolPriceWarning', () => {
  const pool = (price: number, filled = true) => ({
    price,
    tokenReserve: filled ? 1n : 0n,
    masReserve: filled ? 1n : 0n,
  });

  it('warns when a pool is far from the presale price, either way', () => {
    expect(poolPriceWarning(pool(0.002), 0.001)).toContain('100% above');
    expect(poolPriceWarning(pool(0.0005), 0.001)).toContain('50% below');
  });

  it('stays quiet within 10% of it', () => {
    expect(poolPriceWarning(pool(0.00105), 0.001)).toBeNull();
    expect(poolPriceWarning(pool(0.00095), 0.001)).toBeNull();
  });

  it('warns about an empty pool someone else may have priced', () => {
    expect(poolPriceWarning(pool(0.001, false), 0)).toContain('Nobody has added liquidity');
    expect(poolPriceWarning(pool(0.001, true), 0)).toBeNull();
  });
});

describe('Dusa fees', () => {
  // Factory.getPreset(100) on mainnet, read 2026-11-06 (9 × u32 LE).
  const MAINNET_100 = new Uint8Array([
    100, 0, 0, 0, 64, 31, 0, 0, 44, 1, 0, 0, 176, 4, 0, 0, 136, 19, 0, 0, 76, 29, 0, 0, 16, 39, 0,
    0, 240, 73, 2, 0, 120, 0, 0, 0,
  ]);
  // A buildnet pair's FEES_PARAMETERS (bin step 20): the same start, then its live variables.
  const BUILDNET_PAIR_20 = new Uint8Array([
    20, 0, 0, 0, 16, 39, 0, 0, 30, 0, 0, 0, 88, 2, 0, 0, 136, 19, 0, 0, 32, 78, 0, 0, 0, 0, 0, 0,
    48, 87, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 15, 123, 168, 161, 1, 0, 0,
  ]);

  it('reads a preset and a pair’s settings alike', () => {
    expect(readFees(MAINNET_100)).toEqual({ baseFactor: 8_000, protocolShare: 10_000 });
    expect(readFees(BUILDNET_PAIR_20)).toEqual({ baseFactor: 10_000, protocolShare: 0 });
  });

  it('gives the base fee Dusa quotes: 0.8% for 1% bins, 0.4% for 0.5% bins', () => {
    expect(baseFeeBps({ baseFactor: 8_000, protocolShare: 10_000 }, 100)).toBe(80);
    expect(baseFeeBps({ baseFactor: 8_000, protocolShare: 10_000 }, 50)).toBe(40);
    expect(baseFeeBps({ baseFactor: 10_000, protocolShare: 0 }, 25)).toBe(25);
  });

  it('says whether liquidity providers earn trading fees', () => {
    expect(lpFeeText({ baseFactor: 1, protocolShare: 10_000 })).toContain('earn none');
    expect(lpFeeText({ baseFactor: 1, protocolShare: 0 })).toContain('keep 100%');
    expect(lpFeeText({ baseFactor: 1, protocolShare: 2_500 })).toContain('keep 75%');
  });
});
