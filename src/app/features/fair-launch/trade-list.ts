import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { formatPrice } from '../../core/dusa/dusa';
import { tradePrice } from '../../core/fairlaunch/chart';
import { TOKEN_DECIMALS } from '../../core/fairlaunch/curve';
import { Trade } from '../../core/fairlaunch/records';
import { explorerOperationUrl } from '../../core/network/explorer';
import { NetworkStore } from '../../core/network/network-store';
import { ShortAddressPipe } from '../../shared/pipes/short-address-pipe';
import { Pager } from '../../shared/ui/pager/pager';
import { formatUnits } from '../../core/utils/token-amount';
import { ExplorerLink } from '../../shared/ui/explorer-link/explorer-link';

/** Trades per page. */
const PAGE = 10;
/** 139,144,215 → "139.14M". */
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

/**
 * A fair launch's buys and sells, newest first (the contract's trade history), 10 to a page. The
 * first page is live: new trades come in at the top. Leaving it freezes the pages at the trades
 * there were then, so the rows don't move while you read; a note says how many came in since.
 */
@Component({
  selector: 'app-trade-list',
  imports: [ExplorerLink, DatePipe, ShortAddressPipe, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!trades().length) {
      <p class="muted empty">No trades yet.</p>
    } @else {
      <div class="data-table">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Type</th>
              <th class="num">MAS</th>
              <th class="num">{{ symbol() }}</th>
              <th class="num wide">Price</th>
              <th class="num wide">Time</th>
              <th class="num">Tx</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.index) {
              <tr>
                <td>
                  <app-explorer-link [value]="row.trade.trader" />
                  @if (row.trade.trader === me()) {
                    <span class="tag">you</span>
                  }
                </td>
                <td [class]="row.trade.isBuy ? 'buy' : 'sell'">
                  {{ row.trade.isBuy ? 'Buy' : 'Sell' }}
                </td>
                <td class="num">{{ row.mas }}</td>
                <td class="num" [title]="row.exactTokens">{{ row.tokens }}</td>
                <td class="num wide">{{ row.price }}</td>
                <td class="num wide muted">{{ row.trade.time | date: 'MMM d, HH:mm:ss' }}</td>
                <td class="num">
                  @if (row.tx; as url) {
                    <a
                      class="tx"
                      [href]="url"
                      target="_blank"
                      rel="noopener noreferrer"
                      [title]="row.trade.opId + ' — open in the explorer'"
                      ><span class="tx-id mono">{{ row.trade.opId | shortAddress }}</span
                      >↗</a
                    >
                  } @else {
                    <span class="tx-id mono muted" [title]="row.trade.opId">{{
                      row.trade.opId | shortAddress
                    }}</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-pager
        [page]="page()"
        [pages]="pages()"
        [range]="range()"
        label="Trade pages"
        previousLabel="Newer trades"
        nextLabel="Older trades"
        (go)="goTo($event)"
      />
      @if (newer()) {
        <button type="button" class="newer" (click)="goTo(1)">
          {{ newer() }} new {{ newer() === 1 ? 'trade' : 'trades' }} since · back to the newest
        </button>
      }
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

    .buy {
      color: #7ee2a8;
    }

    .sell {
      color: #ff7a88;
    }

    .newer {
      justify-self: start;
      padding: 0;
      border: 0;
      background: none;
      color: var(--ember-text);
      font-size: 13px;
      cursor: pointer;
    }

    .tx {
      text-decoration: none;
    }

    .tx-id {
      margin-right: 3px;
      font-size: 13px;
    }

    /* Phones: account, side, amounts and the explorer arrow only. */
    @media (max-width: 600px) {
      .wide,
      .tx-id {
        display: none;
      }
    }
  `,
})
export class TradeList {
  /** Oldest first, as the contract keeps them. */
  readonly trades = input.required<readonly Trade[]>();
  readonly virtualMas = input.required<bigint>();
  readonly symbol = input.required<string>();
  /** The connected wallet, to mark its own trades. */
  readonly me = input<string | null>(null);
  private readonly network = inject(NetworkStore);

  /** Trades the pages count while frozen (off the first page); null = live, all of them. */
  private readonly frozen = signal<number | null>(null);
  private readonly wanted = signal(1);

  /** The trades the pages are made of: all, or those there were when the first page was left. */
  private readonly counted = computed(() => {
    const frozen = this.frozen();
    const total = this.trades().length;
    // A shorter history is another launch's: back to live.
    return frozen === null || frozen > total ? total : frozen;
  });
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.counted() / PAGE)));
  protected readonly page = computed(() =>
    this.frozen() === null || this.frozen()! > this.trades().length
      ? 1
      : Math.min(this.wanted(), this.pages()),
  );
  /** Trades that came in since the pages were frozen. */
  protected readonly newer = computed(() => this.trades().length - this.counted());
  protected readonly range = computed(() => {
    const from = (this.page() - 1) * PAGE + 1;
    const to = Math.min(this.page() * PAGE, this.counted());
    return `${from}–${to} of ${this.counted().toLocaleString('en-US')}`;
  });

  protected goTo(page: number): void {
    if (page <= 1) {
      this.frozen.set(null);
      this.wanted.set(1);
      return;
    }
    if (this.frozen() === null) this.frozen.set(this.trades().length);
    this.wanted.set(page);
  }

  protected readonly rows = computed(() => {
    const trades = this.trades();
    const top = this.counted() - 1 - (this.page() - 1) * PAGE;
    const out = [];
    for (let i = top; i >= 0 && out.length < PAGE; i--) {
      const trade = trades[i];
      out.push({
        index: i,
        trade,
        mas: whole(trade.mas, 4),
        tokens: COMPACT.format(Number(trade.tokens) / 1e9),
        exactTokens: whole(trade.tokens, 0),
        price: formatPrice(tradePrice(this.virtualMas(), trade)),
        tx: explorerOperationUrl(this.network.config().explorerUrl, trade.opId),
      });
    }
    return out;
  });
}

/** Smallest units (9 decimals) to a number with at most `digits` decimals, with separators. */
function whole(units: bigint, digits: number): string {
  const [int, frac = ''] = formatUnits(units, TOKEN_DECIMALS).split('.');
  const cut = frac.slice(0, digits).replace(/0+$/, '');
  return cut ? `${int}.${cut}` : int;
}
