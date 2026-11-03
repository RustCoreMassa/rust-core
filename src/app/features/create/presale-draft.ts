import { Args } from '@massalabs/massa-web3';
import { parseSupply } from '../../core/launchpad/launch-rules';
import { vestingCycles } from '../../core/launchpad/presale-state';
import { BPS_ALL, tokensFor } from '../../core/launchpad/records';
import { ADDRESS } from '../../core/launchpad/tokenomics';
import { priceNano } from './collection-draft';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The contract's limits on vesting. */
const MIN_VEST_CYCLE_DAYS = 1;
const MAX_VESTING_DAYS = 730;

/** What the presale form collects; amounts as typed, in whole tokens and MAS. */
export interface PresaleDraft {
  /** Tokens per 1 MAS. */
  rate: string;
  softCap: string;
  hardCap: string;
  minBuy: string;
  /** Empty = no limit. */
  maxBuy: string;
  /** 'now' or a datetime-local value. */
  start: 'now' | string;
  /** Duration in hours (1 to 720). */
  hours: number;
  // ---- v1.6.0 extras ----
  whitelist: boolean;
  /** Hours of whitelist-only phase from the start; '' = whitelist only, no public phase. */
  whitelistHours: string;
  /** Addresses to put on the whitelist after creating it (also later, on its page). */
  whitelistAddresses: string;
  vesting: boolean;
  /** Percentages and days as typed. */
  vestFirst: string;
  vestCycleDays: string;
  vestCyclePercent: string;
}

export const EMPTY_PRESALE_DRAFT: PresaleDraft = {
  rate: '',
  softCap: '',
  hardCap: '',
  minBuy: '',
  maxBuy: '',
  start: 'now',
  hours: 72,
  whitelist: false,
  whitelistHours: '24',
  whitelistAddresses: '',
  vesting: false,
  vestFirst: '25',
  vestCycleDays: '30',
  vestCyclePercent: '25',
};

export type PresaleField =
  | 'rate'
  | 'softCap'
  | 'hardCap'
  | 'minBuy'
  | 'maxBuy'
  | 'start'
  | 'hours'
  | 'whitelistHours'
  | 'whitelistAddresses'
  | 'vestFirst'
  | 'vestCycleDays'
  | 'vestCyclePercent';

export interface PresaleTerms {
  /** Token units per 1 MAS. */
  rate: bigint;
  softCap: bigint;
  hardCap: bigint;
  minBuy: bigint;
  maxBuy: bigint;
  /** ms; 0 = start now (the contract starts it when the transaction runs). */
  start: number;
  end: number;
  /** Token units to escrow: exactly what the hard cap sells. */
  tokensForSale: bigint;
  whitelist: boolean;
  /** ms; 0 without a whitelist. */
  publicFrom: number;
  /** Valid, without repeats; added after the presale is created. */
  addresses: string[];
  /** 10 000 = no vesting (the cycle terms are then 0). */
  vestFirstBps: number;
  vestCycleMs: number;
  vestCycleBps: number;
}

/** "25", "12.5", "0.01" → basis points; null when it isn't a percentage with ≤ 2 decimals. */
export function percentBps(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const bps = Math.round(Number(t) * 100);
  return bps <= BPS_ALL ? bps : null;
}

/** Addresses separated by spaces, commas, semicolons or lines; repeats dropped. */
export function parseAddresses(text: string): { addresses: string[]; invalid: string | null } {
  const seen = new Set<string>();
  for (const part of text.split(/[\s,;]+/)) if (part) seen.add(part);
  const addresses = [...seen];
  return { addresses, invalid: addresses.find((a) => !ADDRESS.test(a)) ?? null };
}

/**
 * Why a vesting schedule is refused, per field (the contract's rules): a first release below
 * 100 %, at least 0.01 % per cycle, cycles of whole days (at least one), two years at most.
 */
export function vestingErrors(
  first: number | null,
  cycleDays: number,
  cycleBps: number | null,
): Partial<Record<'vestFirst' | 'vestCycleDays' | 'vestCyclePercent', string>> {
  const errors: Partial<Record<'vestFirst' | 'vestCycleDays' | 'vestCyclePercent', string>> = {};
  if (first === null || first >= BPS_ALL) errors.vestFirst = 'From 0 to 99.99%.';
  if (cycleBps === null || cycleBps <= 0) errors.vestCyclePercent = 'From 0.01 to 100%.';
  if (!Number.isInteger(cycleDays) || cycleDays < MIN_VEST_CYCLE_DAYS)
    errors.vestCycleDays = 'Whole days, at least one.';
  if (!Object.keys(errors).length && first !== null && cycleBps !== null) {
    if (vestingCycles(first, cycleBps) * cycleDays > MAX_VESTING_DAYS)
      errors.vestCycleDays = 'The whole schedule must end within two years (730 days).';
  }
  return errors;
}

/** The draft as contract values, or the errors per field. */
export function presaleTerms(
  d: PresaleDraft,
  decimals: number,
  now = Date.now(),
): { terms: PresaleTerms | null; errors: Partial<Record<PresaleField, string>> } {
  const errors: Partial<Record<PresaleField, string>> = {};
  const rate = parseSupply(d.rate, decimals);
  if (rate === null || rate <= 0n) errors.rate = 'Enter how many tokens 1 MAS buys.';
  const soft = priceNano(d.softCap);
  const hard = priceNano(d.hardCap);
  const min = priceNano(d.minBuy);
  const max = d.maxBuy.trim() === '' ? 0n : priceNano(d.maxBuy);
  if (hard === null || hard <= 0n) errors.hardCap = 'Enter the most MAS to raise.';
  if (soft === null) errors.softCap = 'Enter the MAS needed for success (0 allowed).';
  else if (hard !== null && soft > hard) errors.softCap = 'Must not exceed the hard cap.';
  // The contract refuses a rate for which hard cap × rate doesn't fit in a u256.
  if (rate !== null && rate > 0n && hard !== null && hard > 0n && rate > (2n ** 256n - 1n) / hard)
    errors.rate = 'This rate is too high for the hard cap.';
  if (min === null) errors.minBuy = 'Enter a number (0 allowed).';
  else if (hard !== null && min > hard) errors.minBuy = 'Must not exceed the hard cap.';
  if (max === null) errors.maxBuy = 'Enter a number, or leave it empty.';
  else if (max !== 0n && min !== null && min > max) errors.maxBuy = 'Must be at least the minimum.';
  let start = 0;
  if (d.start !== 'now') {
    start = new Date(d.start).getTime();
    if (!Number.isFinite(start) || start <= now) errors.start = 'Pick a moment in the future.';
    else if (start - now > 90 * DAY) errors.start = 'Start within the next 90 days.';
  }
  if (!Number.isInteger(d.hours) || d.hours < 1 || d.hours > 720)
    errors.hours = 'From 1 hour to 30 days (720 hours).';
  let whitelistHours = 0;
  let addresses: string[] = [];
  if (d.whitelist) {
    if (d.whitelistHours.trim() !== '') {
      whitelistHours = Number(d.whitelistHours);
      if (!Number.isInteger(whitelistHours) || whitelistHours < 1 || whitelistHours >= d.hours)
        errors.whitelistHours = `Whole hours, from 1 to ${Math.max(1, d.hours - 1)} (shorter than the presale).`;
    }
    const parsed = parseAddresses(d.whitelistAddresses);
    addresses = parsed.addresses;
    if (parsed.invalid) errors.whitelistAddresses = `Not a Massa address: ${parsed.invalid}`;
  }
  let vestFirstBps = BPS_ALL;
  let vestCycleMs = 0;
  let vestCycleBps = 0;
  if (d.vesting) {
    const first = percentBps(d.vestFirst);
    const cycleDays = Number(d.vestCycleDays);
    const cycleBps = percentBps(d.vestCyclePercent);
    Object.assign(errors, vestingErrors(first, cycleDays, cycleBps));
    vestFirstBps = first ?? BPS_ALL;
    vestCycleMs = cycleDays * DAY;
    vestCycleBps = cycleBps ?? 0;
  }
  if (Object.keys(errors).length || rate === null || hard === null || soft === null) {
    return { terms: null, errors };
  }
  const begin = start || now;
  // A few minutes of slack when starting now: the transaction runs a little later.
  const end = begin + d.hours * HOUR + (start ? 0 : 10 * 60_000);
  return {
    terms: {
      rate,
      softCap: soft,
      hardCap: hard,
      minBuy: min ?? 0n,
      maxBuy: max ?? 0n,
      start,
      end,
      tokensForSale: tokensFor(hard, rate),
      whitelist: d.whitelist,
      // Whitelist only: the public phase would begin at the end.
      publicFrom: d.whitelist ? (whitelistHours ? begin + whitelistHours * HOUR : end) : 0,
      addresses,
      vestFirstBps,
      vestCycleMs: d.vesting ? vestCycleMs : 0,
      vestCycleBps: d.vesting ? vestCycleBps : 0,
    },
    errors,
  };
}

/**
 * createPresale arguments, in the contract's order; `extras` (Launchpad v1.6.0+) appends the
 * whitelist and vesting terms.
 */
export function createPresaleArgs(token: string, t: PresaleTerms, extras = false): Args {
  const args = new Args()
    .addString(token)
    .addU256(t.tokensForSale)
    .addU256(t.rate)
    .addU64(t.softCap)
    .addU64(t.hardCap)
    .addU64(t.minBuy)
    .addU64(t.maxBuy)
    .addU64(BigInt(t.start))
    .addU64(BigInt(t.end));
  if (!extras) return args;
  return args
    .addBool(t.whitelist)
    .addU64(BigInt(t.publicFrom))
    .addU16(BigInt(t.vestFirstBps))
    .addU64(BigInt(t.vestCycleMs))
    .addU16(BigInt(t.vestCycleBps));
}
