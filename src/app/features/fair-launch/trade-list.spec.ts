import { TestBed } from '@angular/core/testing';
import { Trade } from '../../core/fairlaunch/records';
import { TradeList } from './trade-list';

const MAS = 1_000_000_000n;

/** `n` buys, the i-th of i MAS (so a row's MAS tells which trade it is). */
function trades(n: number): Trade[] {
  return Array.from({ length: n }, (_, i) => ({
    time: Date.UTC(2026, 10, 16) + i * 1000,
    trader: 'AU12dkQx7SpXx9kmvZ6aYLtRd5rbjT8Hwhd7obmrPJrWxbGLxhPvp',
    isBuy: true,
    mas: BigInt(i + 1) * MAS,
    tokens: 1_000_000n * MAS,
    sold: BigInt(i + 1) * 1_000_000n * MAS,
    masIn: BigInt(((i + 1) * (i + 2)) / 2) * MAS,
    opId: `O1trade${i + 1}`,
  }));
}

function setup(n: number) {
  const fixture = TestBed.createComponent(TradeList);
  fixture.componentRef.setInput('trades', trades(n));
  fixture.componentRef.setInput('virtualMas', (200n * MAS) / 3n);
  fixture.componentRef.setInput('symbol', 'CRAB');
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  const masColumn = () =>
    [...el.querySelectorAll('tbody tr')].map((tr) =>
      tr.querySelectorAll('td')[2].textContent!.trim(),
    );
  const click = (label: string) => {
    const button = [...el.querySelectorAll<HTMLButtonElement>('.pages button, .newer')].find(
      (b) => b.textContent!.trim() === label || b.getAttribute('aria-label') === label,
    )!;
    button.click();
    fixture.detectChanges();
  };
  const text = (selector: string) => el.querySelector(selector)?.textContent!.trim() ?? null;
  return { fixture, masColumn, click, text };
}

describe('TradeList', () => {
  it('shows the 10 newest trades first, then pages back', () => {
    const { masColumn, click, text } = setup(25);
    expect(masColumn()).toEqual(['25', '24', '23', '22', '21', '20', '19', '18', '17', '16']);
    expect(text('.range')).toBe('1–10 of 25');
    click('3');
    expect(masColumn()).toEqual(['5', '4', '3', '2', '1']);
    expect(text('.range')).toBe('21–25 of 25');
    click('Newer trades');
    expect(masColumn()[0]).toBe('15');
  });

  it('keeps a page still while new trades come in, and says how many', () => {
    const { fixture, masColumn, click, text } = setup(25);
    click('2');
    fixture.componentRef.setInput('trades', trades(28));
    fixture.detectChanges();
    expect(masColumn()[0]).toBe('15');
    expect(text('.newer')).toContain('3 new trades');
    click('3 new trades since · back to the newest');
    expect(masColumn()[0]).toBe('28');
    expect(text('.newer')).toBeNull();
  });

  it('follows new trades on the first page', () => {
    const { fixture, masColumn } = setup(5);
    fixture.componentRef.setInput('trades', trades(6));
    fixture.detectChanges();
    expect(masColumn()[0]).toBe('6');
  });

  it('starts over for another launch’s shorter history', () => {
    const { fixture, masColumn, click } = setup(25);
    click('3');
    fixture.componentRef.setInput('trades', trades(4));
    fixture.detectChanges();
    expect(masColumn()).toEqual(['4', '3', '2', '1']);
  });
});
