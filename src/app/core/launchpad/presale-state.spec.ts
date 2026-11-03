import {
  PRESALE_CANCELLED,
  PRESALE_OPEN,
  PRESALE_SUCCESS,
  Presale,
  SOURCE_IMPORTED,
  SOURCE_LAUNCHED,
} from './records';
import {
  claimable,
  contributionError,
  hasVesting,
  nextUnlock,
  share,
  unlockedBps,
  vestingSchedule,
  vestingStart,
  vestingSummary,
  whitelistOnly,
  maxContribution,
  presaleCodeRisk,
  presalePhase,
  progressPercent,
  reachesSoftCap,
  timeLeft,
} from './presale-state';

const MAS = 1_000_000_000n;
const base: Presale = {
  id: 1n,
  tokenId: 1n,
  token: 'AS1token',
  creator: 'AU1alice',
  tokensForSale: 100_000n,
  rate: 1_000n,
  softCap: 50n * MAS,
  hardCap: 100n * MAS,
  minBuy: MAS,
  maxBuy: 40n * MAS,
  start: 1_000,
  end: 2_000,
  raised: 0n,
  contributors: 0,
  status: PRESALE_OPEN,
  withdrawn: false,
  feeBps: 200,
  whitelist: false,
  publicFrom: 0,
  whitelisted: 0,
  vestFirstBps: 10_000,
  vestCycleMs: 0,
  vestCycleBps: 0,
  finalizedAt: 0,
};

const DAY = 86_400_000;
/** 25 % at the end (2 000), then 25 % every 30 days. */
const vesting: Presale = {
  ...base,
  status: PRESALE_SUCCESS,
  finalizedAt: 2_500,
  vestFirstBps: 2_500,
  vestCycleMs: 30 * DAY,
  vestCycleBps: 2_500,
};

describe('presale state', () => {
  it('follows the clock while open', () => {
    expect(presalePhase(base, 999)).toBe('upcoming');
    expect(presalePhase(base, 1_000)).toBe('live');
    expect(presalePhase(base, 2_000)).toBe('ended');
    expect(presalePhase({ ...base, raised: 100n * MAS }, 1_500)).toBe('ended'); // hard cap
  });

  it('reports the stored outcome', () => {
    expect(presalePhase({ ...base, status: PRESALE_SUCCESS }, 1_500)).toBe('success');
    expect(presalePhase({ ...base, status: PRESALE_CANCELLED }, 500)).toBe('cancelled');
  });

  it('computes progress and the soft cap', () => {
    expect(progressPercent({ ...base, raised: 33n * MAS })).toBe(33);
    expect(progressPercent({ ...base, raised: (2n * MAS) / 3n })).toBe(0.6);
    expect(reachesSoftCap({ ...base, raised: 50n * MAS })).toBe(true);
    expect(reachesSoftCap({ ...base, raised: 49n * MAS })).toBe(false);
    expect(reachesSoftCap({ ...base, softCap: 0n })).toBe(false); // nothing raised
  });

  it('applies the contract’s contribution rules', () => {
    const live = { ...base, raised: 90n * MAS };
    expect(contributionError(live, 0n, 5n * MAS, 1_500)).toBeNull();
    expect(contributionError(live, 0n, 11n * MAS, 1_500)).toBe(
      'Above the amount left before the hard cap.',
    );
    expect(contributionError(base, 35n * MAS, 6n * MAS, 1_500)).toBe(
      'Above the maximum per wallet.',
    );
    expect(contributionError(base, 0n, MAS / 2n, 1_500)).toBe('Below the minimum contribution.');
    expect(
      contributionError({ ...base, raised: 99n * MAS + MAS / 2n }, 0n, MAS / 2n, 1_500),
    ).toBeNull(); // last buyer
    expect(contributionError(base, 0n, MAS, 500)).toBe('This presale is not live.');
  });

  it('tells the most a wallet may add', () => {
    expect(maxContribution(base, 0n)).toBe(40n * MAS);
    expect(maxContribution({ ...base, raised: 95n * MAS }, 0n)).toBe(5n * MAS);
    expect(maxContribution(base, 40n * MAS)).toBe(0n);
    expect(maxContribution({ ...base, maxBuy: 0n }, 0n)).toBe(100n * MAS);
  });

  it('formats the time left', () => {
    expect(timeLeft(0 + 2 * 86_400_000 + 4 * 3_600_000, 0)).toBe('2d 4h');
    expect(timeLeft(3 * 3_600_000 + 12 * 60_000, 0)).toBe('3h 12m');
    expect(timeLeft(45 * 60_000, 0)).toBe('45m');
    expect(timeLeft(0, 1_000)).toBe('0m');
  });
});

describe('presale code risk', () => {
  it('warns about imported tokens and launched tokens with mutable code', () => {
    expect(presaleCodeRisk({ source: SOURCE_IMPORTED, mutable: false })).toMatch(/imported/);
    expect(presaleCodeRisk({ source: SOURCE_LAUNCHED, mutable: true })).toMatch(/replaced/);
    expect(presaleCodeRisk({ source: SOURCE_LAUNCHED, mutable: false })).toBeNull();
  });
});

describe('presale whitelist', () => {
  const listed = { ...base, whitelist: true, publicFrom: 1_500 };

  it('is whitelist only until the public phase', () => {
    expect(whitelistOnly(listed, 1_499)).toBe(true);
    expect(whitelistOnly(listed, 1_500)).toBe(false);
    expect(whitelistOnly(base, 1_000)).toBe(false);
  });

  it('refuses an unlisted wallet before the public phase', () => {
    expect(contributionError(listed, 0n, MAS, 1_200, false)).toBe(
      'Only the whitelist can contribute for now.',
    );
    expect(contributionError(listed, 0n, MAS, 1_200, true)).toBeNull();
    expect(contributionError(listed, 0n, MAS, 1_500, false)).toBeNull();
  });
});

describe('presale vesting', () => {
  it('counts from the end, or from an earlier finalize', () => {
    expect(vestingStart(vesting)).toBe(2_000);
    expect(vestingStart({ ...vesting, finalizedAt: 1_800 })).toBe(1_800);
    expect(vestingStart({ ...vesting, finalizedAt: 0 })).toBe(2_000); // not finalized yet
  });

  it('unlocks the first release, then a share per cycle, up to 100 %', () => {
    expect(hasVesting(vesting)).toBe(true);
    expect(hasVesting(base)).toBe(false);
    expect(unlockedBps(vesting, 2_000)).toBe(2_500);
    expect(unlockedBps(vesting, 2_000 + 30 * DAY - 1)).toBe(2_500);
    expect(unlockedBps(vesting, 2_000 + 30 * DAY)).toBe(5_000);
    expect(unlockedBps(vesting, 2_000 + 300 * DAY)).toBe(10_000);
    expect(unlockedBps(base, 0)).toBe(10_000);
  });

  it('lists every unlock, the last one capped', () => {
    const schedule = vestingSchedule({ ...vesting, vestFirstBps: 1_000, vestCycleBps: 4_000 });
    expect(schedule.map((u) => u.bps)).toEqual([1_000, 5_000, 9_000, 10_000]);
    expect(schedule[3].at).toBe(2_000 + 90 * DAY);
    expect(nextUnlock(vesting, 2_000)?.bps).toBe(5_000);
    expect(nextUnlock(vesting, 2_000 + 90 * DAY)).toBeNull();
    expect(vestingSchedule(base)).toEqual([{ at: 2_000, bps: 10_000 }]);
  });

  it('claims what is unlocked and not claimed yet, rounded down', () => {
    // 40 MAS × 1 000 units per MAS = 40 000 units.
    expect(claimable(vesting, 40n * MAS, 0n, 2_000)).toBe(10_000n);
    expect(claimable(vesting, 40n * MAS, 10_000n, 2_000)).toBe(0n);
    expect(claimable(vesting, 40n * MAS, 10_000n, 2_000 + 60 * DAY)).toBe(20_000n);
    expect(share(7n, 3_333)).toBe(2n);
  });

  it('sums the schedule up in words', () => {
    expect(vestingSummary(vesting)).toBe('25% at the end, then 25% every 30 days');
    expect(
      vestingSummary({ ...vesting, vestFirstBps: 0, vestCycleMs: DAY, vestCycleBps: 1_250 }),
    ).toBe('12.5% every day');
    expect(vestingSummary(base)).toBe('All at the end');
  });
});
