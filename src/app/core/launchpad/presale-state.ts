import {
  BPS_ALL,
  PRESALE_CANCELLED,
  PRESALE_FAILED,
  PRESALE_OPEN,
  PRESALE_SUCCESS,
  Presale,
  Project,
  SOURCE_IMPORTED,
  tokensFor,
} from './records';

/**
 * Why a presale's token code may change under its contributors, or null: an imported token
 * (code the Launchpad didn't write) or a launched one with mutable code. Its owner could make
 * transfers fail after withdrawing the raised MAS, and claims would fail too.
 */
export function presaleCodeRisk(token: Pick<Project, 'source' | 'mutable'>): string | null {
  if (token.source === SOURCE_IMPORTED)
    return "This token was imported: the Launchpad didn't write its code, which may let its owner change it.";
  if (token.mutable) return "This token's code can be replaced by its owner.";
  return null;
}

/**
 * Where a presale stands at `now`. The contract stores only open / success / failed /
 * cancelled; upcoming, live and "ended, waiting to be finalized" follow from the clock.
 */
export type PresalePhase = 'upcoming' | 'live' | 'ended' | 'success' | 'failed' | 'cancelled';

export function presalePhase(p: Presale, now = Date.now()): PresalePhase {
  if (p.status === PRESALE_SUCCESS) return 'success';
  if (p.status === PRESALE_FAILED) return 'failed';
  if (p.status === PRESALE_CANCELLED) return 'cancelled';
  if (p.status !== PRESALE_OPEN) return 'ended';
  if (now < p.start) return 'upcoming';
  if (now >= p.end || p.raised >= p.hardCap) return 'ended';
  return 'live';
}

export const PHASE_LABELS: Record<PresalePhase, string> = {
  upcoming: 'Upcoming',
  live: 'Live',
  ended: 'Ended — awaiting finalization',
  success: 'Successful',
  failed: 'Failed — refunds open',
  cancelled: 'Cancelled — refunds open',
};

/** Raised / hard cap, 0-100, with one decimal. */
export function progressPercent(p: Presale): number {
  if (p.hardCap === 0n) return 0;
  return Number((p.raised * 1_000n) / p.hardCap) / 10;
}

/** Will finalize call it a success (soft cap reached)? */
export function reachesSoftCap(p: Presale): boolean {
  return p.raised > 0n && p.raised >= p.softCap;
}

/** The most MAS `contributed`-so-far wallet may still add now, in nanoMAS. */
export function maxContribution(p: Presale, contributed: bigint): bigint {
  const left = p.hardCap - p.raised;
  const walletLeft = p.maxBuy === 0n ? left : p.maxBuy - contributed;
  return left < walletLeft ? left : walletLeft > 0n ? walletLeft : 0n;
}

/** Only whitelisted addresses may contribute at `now` (before the public phase). */
export function whitelistOnly(p: Presale, now = Date.now()): boolean {
  return p.whitelist && now < p.publicFrom;
}

/**
 * Why `amount` can't be contributed now, or null — the contract's rules, for the form.
 * `listed`: the wallet is on the presale's whitelist (only read when it has one).
 */
export function contributionError(
  p: Presale,
  contributed: bigint,
  amount: bigint,
  now = Date.now(),
  listed = true,
): string | null {
  if (presalePhase(p, now) !== 'live') return 'This presale is not live.';
  if (whitelistOnly(p, now) && !listed) return 'Only the whitelist can contribute for now.';
  if (amount <= 0n) return 'Enter an amount.';
  const left = p.hardCap - p.raised;
  if (amount > left) return 'Above the amount left before the hard cap.';
  if (p.maxBuy !== 0n && contributed + amount > p.maxBuy) return 'Above the maximum per wallet.';
  if (contributed + amount < p.minBuy && amount !== left) return 'Below the minimum contribution.';
  return null;
}

/** "2d 4h", "3h 12m", "45m" — time left until `target`. */
export function timeLeft(target: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((target - now) / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

// ---- vesting (v1.6.0) ----------------------------------------------------------------------

export function hasVesting(p: Presale): boolean {
  return p.vestFirstBps < BPS_ALL;
}

/** When the cycles start counting: the finalize, or the end when it came later (or not yet). */
export function vestingStart(p: Presale): number {
  return p.finalizedAt && p.finalizedAt < p.end ? p.finalizedAt : p.end;
}

/** Share of the bought tokens unlocked at `now`, bps — the contract's rule. */
export function unlockedBps(p: Presale, now = Date.now()): number {
  if (!hasVesting(p)) return BPS_ALL;
  const from = vestingStart(p);
  const cycles = now > from ? Math.floor((now - from) / p.vestCycleMs) : 0;
  return Math.min(BPS_ALL, p.vestFirstBps + cycles * p.vestCycleBps);
}

/** amount × bps / 10 000, rounded down. */
export function share(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / BigInt(BPS_ALL);
}

/** Cycles after the first release until everything is unlocked. */
export function vestingCycles(firstBps: number, cycleBps: number): number {
  return cycleBps > 0 ? Math.ceil((BPS_ALL - firstBps) / cycleBps) : 0;
}

export interface Unlock {
  /** ms */
  at: number;
  /** Unlocked by then, bps. */
  bps: number;
}

/** Every unlock: the first release at the start of vesting, then one per cycle up to 100 %. */
export function vestingSchedule(p: Presale): Unlock[] {
  const from = vestingStart(p);
  if (!hasVesting(p)) return [{ at: from, bps: BPS_ALL }];
  const unlocks: Unlock[] = [{ at: from, bps: p.vestFirstBps }];
  const cycles = vestingCycles(p.vestFirstBps, p.vestCycleBps);
  for (let i = 1; i <= cycles; i++) {
    unlocks.push({
      at: from + i * p.vestCycleMs,
      bps: Math.min(BPS_ALL, p.vestFirstBps + i * p.vestCycleBps),
    });
  }
  return unlocks;
}

/** The next unlock after `now`, or null when everything is unlocked. */
export function nextUnlock(p: Presale, now = Date.now()): Unlock | null {
  return vestingSchedule(p).find((u) => u.at > now) ?? null;
}

/** Token units a contributor can claim at `now`: unlocked minus already claimed. */
export function claimable(
  p: Presale,
  contribution: bigint,
  claimed: bigint,
  now = Date.now(),
): bigint {
  const unlocked = share(tokensFor(contribution, p.rate), unlockedBps(p, now));
  return unlocked > claimed ? unlocked - claimed : 0n;
}

/** "25%", "12.5%" — basis points as a percentage. */
export function bpsPercent(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** "25% at the end, then 15% every 30 days" — or "All at the end". */
export function vestingSummary(
  p: Pick<Presale, 'vestFirstBps' | 'vestCycleMs' | 'vestCycleBps'>,
): string {
  if (p.vestFirstBps >= BPS_ALL) return 'All at the end';
  const days = Math.round(p.vestCycleMs / 86_400_000);
  const every = days === 1 ? 'every day' : `every ${days} days`;
  const first = p.vestFirstBps ? `${bpsPercent(p.vestFirstBps)} at the end, then ` : '';
  return `${first}${bpsPercent(p.vestCycleBps)} ${every}`;
}
