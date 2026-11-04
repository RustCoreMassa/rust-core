import { Args } from '@massalabs/massa-web3';
import {
  EMPTY_PRESALE_DRAFT,
  PresaleDraft,
  createPresaleArgs,
  parseAddresses,
  percentBps,
  presaleTerms,
  vestingErrors,
} from './presale-draft';

const MAS = 1_000_000_000n;
const DONATION = 'AU126s93ZxbT4QUJcZYqsAxyMc3wv8nkHJYKYCtgQyEnZ8VGRM99P';
const CONTRACT = 'AS125HSzXL9sphoniiqezuYKX3mGNuuS19yLQKvaJUGyEkfALpVTB';
const NOW = Date.UTC(2026, 9, 5, 12, 0);
const valid: PresaleDraft = {
  ...EMPTY_PRESALE_DRAFT,
  rate: '1000',
  softCap: '50',
  hardCap: '100',
  minBuy: '1',
  maxBuy: '40',
};

describe('presale draft', () => {
  it('turns the form into contract values; tokens for sale cover the hard cap exactly', () => {
    const { terms, errors } = presaleTerms(valid, 9, NOW);
    expect(errors).toEqual({});
    expect(terms!.rate).toBe(1_000n * 10n ** 9n);
    expect(terms!.hardCap).toBe(100n * MAS);
    expect(terms!.tokensForSale).toBe(100_000n * 10n ** 9n);
    expect(terms!.start).toBe(0); // now
    expect(terms!.end).toBe(NOW + 72 * 3_600_000 + 600_000);
  });

  it('reports each invalid field', () => {
    const { terms, errors } = presaleTerms(
      { ...valid, softCap: '101', minBuy: '50', maxBuy: '10', hours: 0, rate: '0' },
      9,
      NOW,
    );
    expect(terms).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['hours', 'maxBuy', 'rate', 'softCap']);
  });

  it('refuses a rate for which hard cap × rate overflows, like the contract', () => {
    const hard = 100n * MAS;
    const highest = (2n ** 256n - 1n) / hard; // smallest units per MAS, decimals 0
    expect(presaleTerms({ ...valid, rate: String(highest) }, 0, NOW).errors.rate).toBeUndefined();
    expect(presaleTerms({ ...valid, rate: String(highest + 1n) }, 0, NOW).errors.rate).toMatch(
      /too high/,
    );
  });

  it('checks a scheduled start', () => {
    const past = presaleTerms({ ...valid, start: '2026-10-01T10:00' }, 9, NOW);
    expect(past.errors.start).toBe('Pick a moment in the future.');
    const later = presaleTerms({ ...valid, start: '2026-10-06T10:00' }, 9, NOW);
    expect(later.terms!.start).toBe(new Date('2026-10-06T10:00').getTime());
    expect(later.terms!.end).toBe(later.terms!.start + 72 * 3_600_000);
  });

  it('builds createPresale args in the contract’s order', () => {
    const { terms } = presaleTerms({ ...valid, maxBuy: '' }, 9, NOW);
    const args = new Args(createPresaleArgs('AS1token', terms!).serialize());
    expect(args.nextString()).toBe('AS1token');
    expect(args.nextU256()).toBe(100_000n * 10n ** 9n);
    expect(args.nextU256()).toBe(1_000n * 10n ** 9n);
    expect(args.nextU64()).toBe(50n * MAS);
    expect(args.nextU64()).toBe(100n * MAS);
    expect(args.nextU64()).toBe(MAS);
    expect(args.nextU64()).toBe(0n); // no maximum
    expect(args.nextU64()).toBe(0n); // start now
    expect(args.nextU64()).toBe(BigInt(terms!.end));
  });

  it('ends the whitelist phase after its hours, or at the end', () => {
    const later = '2026-10-06T10:00';
    const start = new Date(later).getTime();
    const hours = presaleTerms(
      { ...valid, start: later, whitelist: true, whitelistHours: '24' },
      9,
      NOW,
    );
    expect(hours.terms!.publicFrom).toBe(start + 24 * 3_600_000);
    const only = presaleTerms(
      { ...valid, start: later, whitelist: true, whitelistHours: '' },
      9,
      NOW,
    );
    expect(only.terms!.publicFrom).toBe(only.terms!.end);
    expect(presaleTerms(valid, 9, NOW).terms!.publicFrom).toBe(0);
    const long = presaleTerms({ ...valid, whitelist: true, whitelistHours: '72' }, 9, NOW);
    expect(long.errors.whitelistHours).toMatch(/from 1 to 71/);
  });

  it('reads whitelist addresses, without repeats, and names an invalid one', () => {
    expect(parseAddresses(`${DONATION}\n${DONATION}, ${CONTRACT};`)).toEqual({
      addresses: [DONATION, CONTRACT],
      invalid: null,
    });
    expect(parseAddresses(`${DONATION} AU1nope`).invalid).toBe('AU1nope');
    const terms = presaleTerms({ ...valid, whitelist: true, whitelistAddresses: 'hello' }, 9, NOW);
    expect(terms.errors.whitelistAddresses).toBe('Not a Massa address: hello');
  });

  it('reads percentages with up to two decimals', () => {
    expect(percentBps('25')).toBe(2_500);
    expect(percentBps('12.5')).toBe(1_250);
    expect(percentBps('0.01')).toBe(1);
    expect(percentBps('100')).toBe(10_000);
    expect(percentBps('100.01')).toBeNull();
    expect(percentBps('1.234')).toBeNull();
    expect(percentBps('-5')).toBeNull();
  });

  it('checks the vesting schedule like the contract', () => {
    expect(vestingErrors(2_500, 30, 2_500)).toEqual({});
    expect(vestingErrors(10_000, 30, 2_500).vestFirst).toBeDefined();
    expect(vestingErrors(2_500, 30, 0).vestCyclePercent).toBeDefined();
    expect(vestingErrors(2_500, 0, 2_500).vestCycleDays).toBeDefined();
    expect(vestingErrors(2_500, 1.5, 2_500).vestCycleDays).toBeDefined();
    // 10 cycles of 10 %: 73 days each at most; 4 cycles of 30 % (the last one 10 %).
    expect(vestingErrors(0, 73, 1_000)).toEqual({});
    expect(vestingErrors(0, 74, 1_000).vestCycleDays).toMatch(/two years/);
    expect(vestingErrors(0, 182, 3_000)).toEqual({});
    expect(vestingErrors(0, 183, 3_000).vestCycleDays).toMatch(/two years/);
  });

  it('appends whitelist and vesting to createPresale args (v1.6.0)', () => {
    const { terms } = presaleTerms(
      { ...valid, whitelist: true, whitelistHours: '', vesting: true },
      9,
      NOW,
    );
    const plain = new Args(createPresaleArgs('AS1token', terms!).serialize()).serialize().length;
    const full = new Args(createPresaleArgs('AS1token', terms!, true).serialize());
    full.nextString();
    full.nextU256();
    full.nextU256();
    for (let i = 0; i < 6; i++) full.nextU64();
    expect(full.getOffset()).toBe(plain);
    expect(full.nextBool()).toBe(true);
    expect(full.nextU64()).toBe(BigInt(terms!.end)); // whitelist only
    expect(full.nextU16()).toBe(2_500n);
    expect(full.nextU64()).toBe(30n * 86_400_000n);
    expect(full.nextU16()).toBe(2_500n);
    expect(terms!.vestFirstBps).toBe(2_500);
  });

  it('sends no cycle terms without vesting', () => {
    const { terms } = presaleTerms({ ...valid, vesting: false }, 9, NOW);
    expect(terms!.vestFirstBps).toBe(10_000);
    expect(terms!.vestCycleMs).toBe(0);
    expect(terms!.vestCycleBps).toBe(0);
  });
});
