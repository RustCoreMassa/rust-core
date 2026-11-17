import { Args } from '@massalabs/massa-web3';
import { BALANCE_PREFIX, readHolders, sharePercent } from './holders';

const key = (address: string) =>
  new Uint8Array([...BALANCE_PREFIX, ...new TextEncoder().encode(address)]);
const u256 = (n: bigint) => new Args().addU256(n).serialize();

describe('token holders', () => {
  it('reads balance entries, largest first, without empty ones', () => {
    const holders = readHolders(
      [key('AU1small'), key('AS1curve'), key('AU1gone'), key('AU1big')],
      [u256(5n), u256(700n), u256(0n), u256(90n)],
    );
    expect(holders).toEqual([
      { address: 'AS1curve', balance: 700n },
      { address: 'AU1big', balance: 90n },
      { address: 'AU1small', balance: 5n },
    ]);
  });

  it('skips entries it cannot read', () => {
    expect(readHolders([key('AU1a'), key('AU1b')], [null, new Uint8Array(3)])).toEqual([]);
  });

  it('shows shares of the supply', () => {
    expect(sharePercent(1n, 4n)).toBe('25.00%');
    expect(sharePercent(1234n, 10_000n)).toBe('12.34%');
    expect(sharePercent(1n, 10n ** 18n)).toBe('<0.01%');
    expect(sharePercent(0n, 0n)).toBe('—');
  });
});
