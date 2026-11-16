import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Args } from '@massalabs/massa-web3';
import { formatPrice, poolUrl } from '../../core/dusa/dusa';
import {
  DEFAULT_SLIPPAGE_BPS,
  GRADUATE_COINS,
  PHASE_LABELS,
  POOL_TOKENS,
  TOKEN_DECIMALS,
  TOTAL_SUPPLY,
  TRADE_MARGIN,
  buyCoins,
  buyLimit,
  feeOf,
  launchPhase,
  quoteBuy,
  quoteSell,
  spotPrice,
  withSlippage,
} from '../../core/fairlaunch/curve';
import { tradePrice } from '../../core/fairlaunch/chart';
import { FairLaunchReader } from '../../core/fairlaunch/fair-launch-reader';
import { Launch, Trade } from '../../core/fairlaunch/records';
import { parseSupply } from '../../core/launchpad/launch-rules';
import { ALLOWANCE_COINS } from '../../core/launchpad/presale-cost';
import { hex } from '../../core/launchpad/records';
import { TokenReader } from '../../core/launchpad/token-reader';
import { Transactions } from '../../core/launchpad/transactions';
import { NetworkStore } from '../../core/network/network-store';
import { formatUnits } from '../../core/utils/token-amount';
import { toUserMessage } from '../../core/utils/user-error';
import { WalletStore } from '../../core/wallet/wallet-store';
import { ConnectWalletDialog } from '../../layout/connect-wallet-dialog/connect-wallet-dialog';
import { MasPipe } from '../../shared/pipes/units-pipe';
import { CurveProgress } from '../../shared/ui/curve-progress/curve-progress';
import { ProjectLogo } from '../../shared/ui/project-logo/project-logo';
import { HolderList } from '../../shared/ui/holder-list/holder-list';
import { Holder } from '../../core/launchpad/holders';
import { PriceChart } from './price-chart';
import { TradeList } from './trade-list';
import { ExplorerLink } from '../../shared/ui/explorer-link/explorer-link';

type Side = 'buy' | 'sell';
type Busy = 'buy' | 'approve' | 'sell' | 'graduate' | null;

/** How often an open launch is read again (curve, new trades), while the tab is visible. */
const POLL_MS = 4_000;
/** The holders are read again with new trades, at most this often. */
const HOLDERS_EVERY_MS = 15_000;

/** One fair launch: its curve, buy and sell, and its move to Dusa. */
@Component({
  selector: 'app-fair-launch-page',
  imports: [
    ExplorerLink,
    DatePipe,
    RouterLink,
    MasPipe,
    ProjectLogo,
    CurveProgress,
    ConnectWalletDialog,
    PriceChart,
    TradeList,
    HolderList,
  ],
  templateUrl: './fair-launch-page.html',
  styleUrl: './fair-launch-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FairLaunchPage {
  private readonly fair = inject(FairLaunchReader);
  private readonly tokens = inject(TokenReader);
  private readonly transactions = inject(Transactions);
  protected readonly network = inject(NetworkStore);
  protected readonly wallet = inject(WalletStore);
  private readonly connectDialog = viewChild.required(ConnectWalletDialog);

  /** Route parameter. */
  readonly id = input.required<string>();

  /** undefined = loading, null = not found. */
  protected readonly launch = signal<Launch | null | undefined>(undefined);
  /** The wallet's balance of the token, smallest units; null when unknown. */
  protected readonly balance = signal<bigint | null>(null);
  /** The launch's trade history, oldest first; grows as new trades come in. */
  protected readonly trades = signal<Trade[]>([]);
  /** Which launch `trades` belongs to (contract + id). */
  private tradesOf = '';
  /** The token's holders, largest first; null while read. */
  protected readonly holders = signal<Holder[] | null>(null);
  /** When the holders were last read, and for which launch. */
  private holdersAt = 0;
  private holdersOf = '';
  protected readonly holderLabels = computed(() => {
    const l = this.launch();
    const fair = this.fair.address();
    if (!l || !fair) return {};
    const labels: Record<string, string> = {
      [l.creator]: 'Creator',
      [fair]: this.phase() === 'graduated' ? 'Fair Launch' : 'Bonding curve',
    };
    if (l.pair) labels[l.pair] = 'Dusa pool';
    return labels;
  });
  protected readonly side = signal<Side>('buy');
  protected readonly amount = signal('');
  protected readonly busy = signal<Busy>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly labels = PHASE_LABELS;
  protected readonly decimals = TOKEN_DECIMALS;
  protected readonly totalSupply = TOTAL_SUPPLY;
  protected readonly poolTokens = POOL_TOKENS;

  /** Until when the curve keeps its last unit (minimum time); null once it may sell out. */
  protected readonly waitsUntil = computed(() => {
    const l = this.launch();
    return l && this.phase() === 'trading' && Date.now() < l.sellOutFrom ? l.sellOutFrom : null;
  });
  protected readonly phase = computed(() => {
    const l = this.launch();
    return l ? launchPhase(l) : null;
  });
  /**
   * MAS per token: the curve's now, or once on Dusa (the record's curve is emptied then) the
   * price its last trade left. Null while that trade isn't read yet.
   */
  private readonly priceValue = computed(() => {
    const l = this.launch();
    if (!l) return null;
    if (this.phase() !== 'graduated') return spotPrice(l);
    const last = this.trades().at(-1);
    return last ? tradePrice(l.virtualMas, last) : null;
  });
  protected readonly price = computed(() => {
    const p = this.priceValue();
    return p === null ? '—' : formatPrice(p);
  });
  protected readonly cap = computed(() => {
    const p = this.priceValue();
    return p === null ? '—' : formatPrice(p * Number(TOTAL_SUPPLY / 10n ** 9n));
  });
  protected readonly hash = computed(() => hex(this.launch()?.templateHash ?? new Uint8Array()));
  protected readonly poolLink = computed(() => {
    const l = this.launch();
    const dusa = this.network.config().dusa;
    if (!l || !l.pair || !dusa?.appUrl) return null;
    return poolUrl(dusa.appUrl, l.token, dusa.wmas, l.binStep);
  });

  /** The typed amount: nanoMAS for a buy, token units for a sell (both 9 decimals). */
  protected readonly amountUnits = computed(() => {
    const text = this.amount().trim();
    return text === '' ? 0n : parseSupply(text, 9);
  });
  protected readonly amountError = computed(() => {
    const units = this.amountUnits();
    if (units === null) return 'Enter a number, like 25.';
    if (this.side() === 'sell' && units > (this.balance() ?? 0n)) return 'More than you hold.';
    return null;
  });
  /** What the trade gives, before slippage: tokens for a buy, nanoMAS after fee for a sell. */
  protected readonly preview = computed(() => {
    const l = this.launch();
    const units = this.amountUnits();
    if (!l || !units) return null;
    if (this.side() === 'buy') {
      const q = quoteBuy(l, units, buyLimit(l, Date.now()));
      return { out: q.tokens, spent: q.mas, fee: feeOf(q.mas, l.tradeFeeBps) };
    }
    const gross = quoteSell(l, units);
    const fee = feeOf(gross, l.tradeFeeBps);
    return { out: gross - fee, spent: units, fee };
  });
  protected readonly previewText = computed(() => {
    const p = this.preview();
    if (!p) return null;
    const symbol = this.launch()?.symbol ?? '';
    return this.side() === 'buy'
      ? `About ${this.whole(p.out)} ${symbol} (fee ${formatUnits(p.fee, 9)} MAS)`
      : `About ${formatUnits(p.out, 9)} MAS after the ${formatUnits(p.fee, 9)} MAS fee`;
  });

  private run = 0;

  constructor() {
    effect(() => {
      const id = this.id();
      this.network.network();
      const address = this.fair.address();
      const holder = this.wallet.address();
      untracked(() => (address ? void this.load(id, holder) : this.launch.set(null)));
    });
    // Live: while the curve trades (or waits for its move to Dusa), read it again every few
    // seconds; new trades go onto the chart and the list.
    const timer = setInterval(() => {
      const phase = this.phase();
      if (document.visibilityState !== 'visible' || this.busy()) return;
      if (phase === 'trading' || phase === 'complete')
        void this.load(this.id(), this.wallet.address());
    }, POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected connect(): void {
    this.connectDialog().open();
  }

  protected setSide(side: Side): void {
    this.side.set(side);
    this.amount.set('');
    this.error.set(null);
    this.notice.set(null);
  }

  protected setAmount(event: Event): void {
    this.amount.set((event.target as HTMLInputElement).value);
  }

  protected useAll(): void {
    this.amount.set(formatUnits(this.balance() ?? 0n, 9).replace(/,/g, ''));
  }

  protected whole(units: bigint): string {
    return formatUnits(units, TOKEN_DECIMALS).replace(/\.\d+$/, '');
  }

  protected async trade(): Promise<void> {
    const l = this.launch();
    const target = this.fair.address();
    const units = this.amountUnits();
    const preview = this.preview();
    const owner = this.wallet.address();
    if (!l || !target || !units || !preview || this.amountError() || !owner) return;
    this.error.set(null);
    this.notice.set(null);
    try {
      if (this.side() === 'buy') {
        this.busy.set('buy');
        await this.transactions.send({
          target,
          func: 'buy',
          args: new Args()
            .addU64(l.id)
            .addU64(units)
            .addU64(withSlippage(preview.out, DEFAULT_SLIPPAGE_BPS)),
          coins: buyCoins(units, l.tradeFeeBps),
        });
        this.notice.set('Bought.');
      } else {
        // The curve takes the tokens back with transferFrom: allow it first if needed.
        const allowed = await this.tokens.allowance(l.token, owner, target);
        if (allowed < units) {
          this.busy.set('approve');
          await this.transactions.send({
            target: l.token,
            func: 'increaseAllowance',
            args: new Args().addString(target).addU256(units - allowed),
            coins: ALLOWANCE_COINS,
          });
        }
        this.busy.set('sell');
        await this.transactions.send({
          target,
          func: 'sell',
          args: new Args()
            .addU64(l.id)
            .addU64(units)
            .addU64(withSlippage(preview.out, DEFAULT_SLIPPAGE_BPS)),
          coins: TRADE_MARGIN,
        });
        this.notice.set('Sold.');
      }
      this.amount.set('');
    } catch (err) {
      this.error.set(toUserMessage(err));
    } finally {
      this.busy.set(null);
      await this.load(this.id(), this.wallet.address());
    }
  }

  protected async graduate(): Promise<void> {
    const l = this.launch();
    const target = this.fair.address();
    if (!l || !target) return;
    this.busy.set('graduate');
    this.error.set(null);
    try {
      await this.transactions.send({
        target,
        func: 'graduate',
        args: new Args().addU64(l.id),
        coins: GRADUATE_COINS,
      });
    } catch (err) {
      this.error.set(toUserMessage(err));
    } finally {
      this.busy.set(null);
      await this.load(this.id(), this.wallet.address());
    }
  }

  private async loadHolders(token: string, key: string): Promise<void> {
    this.holdersAt = Date.now();
    try {
      const holders = await this.tokens.holders(token);
      if (key === this.holdersOf) this.holders.set(holders);
    } catch {
      // Kept as they were; read again with the next trades.
      this.holdersAt = 0;
    }
  }

  private async load(id: string, holder: string | null): Promise<void> {
    const run = ++this.run;
    let launchId: bigint;
    try {
      launchId = BigInt(id);
    } catch {
      this.launch.set(null);
      return;
    }
    try {
      const l = await this.fair.launch(launchId);
      if (run !== this.run) return;
      const key = `${this.fair.address()}:${l.id}`;
      const known = key === this.tradesOf ? this.trades() : [];
      const fresh =
        BigInt(known.length) < l.trades
          ? await this.fair.trades(l.id, BigInt(known.length), l.trades)
          : [];
      const balance = holder ? await this.tokens.balanceOf(l.token, holder) : null;
      if (run !== this.run) return;
      this.launch.set(l);
      if (key !== this.tradesOf || fresh.length) {
        this.tradesOf = key;
        this.trades.set([...known, ...fresh]);
      }
      this.balance.set(balance);
      // Holders: read with the launch, then again when trades came in (at most every 15 s).
      if (key !== this.holdersOf) {
        this.holdersOf = key;
        this.holders.set(null);
        void this.loadHolders(l.token, key);
      } else if (fresh.length && Date.now() - this.holdersAt > HOLDERS_EVERY_MS) {
        void this.loadHolders(l.token, key);
      }
    } catch (err) {
      if (run !== this.run) return;
      const message = toUserMessage(err);
      if (this.launch() === undefined || /No such launch/.test(String(err))) this.launch.set(null);
      else this.error.set(message);
    }
  }
}
