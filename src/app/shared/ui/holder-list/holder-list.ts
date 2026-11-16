import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Holder, sharePercent } from '../../../core/launchpad/holders';
import { formatUnits } from '../../../core/utils/token-amount';
import { ExplorerLink } from '../explorer-link/explorer-link';
import { Pager } from '../pager/pager';

const PAGE = 10;
/** 139,144,215 → "139.14M". */
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

/** A token's holders, largest first, 10 to a page, with their share of the supply. */
@Component({
  selector: 'app-holder-list',
  imports: [ExplorerLink, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (holders() === null) {
      <p class="muted empty">Reading the holders…</p>
    } @else if (!holders()!.length) {
      <p class="muted empty">No holders yet.</p>
    } @else {
      <div class="data-table">
        <table>
          <thead>
            <tr>
              <th class="num">#</th>
              <th>Account</th>
              <th class="num">{{ symbol() }}</th>
              <th class="num">Share</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.address) {
              <tr>
                <td class="num muted">{{ row.rank }}</td>
                <td>
                  <app-explorer-link [value]="row.address" />
                  @if (row.label) {
                    <span class="tag">{{ row.label }}</span>
                  }
                  @if (row.address === me()) {
                    <span class="tag">you</span>
                  }
                </td>
                <td class="num" [title]="row.exact">{{ row.amount }}</td>
                <td class="num">{{ row.share }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-pager
        [page]="current()"
        [pages]="pages()"
        [range]="range()"
        label="Holder pages"
        (go)="page.set($event)"
      />
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 12px;
    }

    .empty {
      margin: 0;
    }
  `,
})
export class HolderList {
  /** Largest first; null while they are read. */
  readonly holders = input.required<readonly Holder[] | null>();
  readonly totalSupply = input.required<bigint>();
  readonly decimals = input.required<number>();
  readonly symbol = input.required<string>();
  /** Names for known addresses (the curve, a pool, the creator). */
  readonly labels = input<Readonly<Record<string, string>>>({});
  /** The connected wallet. */
  readonly me = input<string | null>(null);

  protected readonly page = signal(1);
  protected readonly pages = computed(() =>
    Math.max(1, Math.ceil((this.holders()?.length ?? 0) / PAGE)),
  );
  /** The page asked for, within the pages there are now. */
  protected readonly current = computed(() => Math.min(this.page(), this.pages()));
  protected readonly range = computed(() => {
    const total = this.holders()?.length ?? 0;
    const from = (this.current() - 1) * PAGE + 1;
    const to = Math.min(this.current() * PAGE, total);
    return `${from}–${to} of ${total.toLocaleString('en-US')} holders`;
  });

  protected readonly rows = computed(() => {
    const holders = this.holders() ?? [];
    const start = (this.current() - 1) * PAGE;
    const scale = 10 ** this.decimals();
    return holders.slice(start, start + PAGE).map((h, i) => ({
      rank: start + i + 1,
      address: h.address,
      label: this.labels()[h.address] ?? null,
      amount: COMPACT.format(Number(h.balance) / scale),
      exact: formatUnits(h.balance, this.decimals()),
      share: sharePercent(h.balance, this.totalSupply()),
    }));
  });
}
