import { Args } from '@massalabs/massa-web3';

/** One holder of an MRC20 token. */
export interface Holder {
  address: string;
  /** Smallest units. */
  balance: bigint;
}

/** The standard MRC20 balance key: 'BALANCE' + address → u256 (sc-standards balanceKey). */
export const BALANCE_PREFIX = new TextEncoder().encode('BALANCE');

/**
 * Holders from a token's balance entries (keys from getStorageKeys with BALANCE_PREFIX, their
 * values in the same order), largest first. Empty balances (an entry stays after everything was
 * sent away) are left out.
 */
export function readHolders(keys: Uint8Array[], values: (Uint8Array | null)[]): Holder[] {
  const decoder = new TextDecoder();
  const out: Holder[] = [];
  keys.forEach((key, i) => {
    const value = values[i];
    if (!value || value.length !== 32) return;
    const balance = new Args(value).nextU256();
    if (balance > 0n)
      out.push({ address: decoder.decode(key.subarray(BALANCE_PREFIX.length)), balance });
  });
  return out.sort((a, b) => (a.balance === b.balance ? 0 : a.balance > b.balance ? -1 : 1));
}

/** `part` of `whole` in percent, two decimals ("12.34%"), "<0.01%" for a crumb. */
export function sharePercent(part: bigint, whole: bigint): string {
  if (whole <= 0n) return '—';
  const bps = (part * 1_000_000n) / whole; // hundredths of a basis point
  if (bps === 0n && part > 0n) return '<0.01%';
  return `${(Number(bps) / 10_000).toFixed(2)}%`;
}
