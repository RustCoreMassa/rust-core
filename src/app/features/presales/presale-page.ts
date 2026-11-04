import {
  ChangeDetectionStrategy,
  Component,
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
import { Args, ArrayTypes } from '@massalabs/massa-web3';
import { LaunchpadReader, WHITELIST_BATCH } from '../../core/launchpad/launchpad-reader';
import {
  CANCEL_COINS,
  CLAIM_COINS,
  CONTRIBUTE_MARGIN,
  FINALIZE_COINS,
  RECLAIM_COINS,
  WITHDRAW_COINS,
  whitelistCoins,
} from '../../core/launchpad/presale-cost';
import {
  PHASE_LABELS,
  bpsPercent,
  claimable,
  contributionError,
  hasVesting,
  nextUnlock,
  vestingSchedule,
  vestingSummary,
  whitelistOnly,
  maxContribution,
  presaleCodeRisk,
  presalePhase,
  reachesSoftCap,
  timeLeft,
} from '../../core/launchpad/presale-state';
import { PRESALE_OPEN, Presale, Project, tokensFor } from '../../core/launchpad/records';
import { TokenReader } from '../../core/launchpad/token-reader';
import { Transactions } from '../../core/launchpad/transactions';
import { NetworkStore } from '../../core/network/network-store';
import { formatUnits } from '../../core/utils/token-amount';
import { toUserMessage } from '../../core/utils/user-error';
import { WalletStore } from '../../core/wallet/wallet-store';
import { ConnectWalletDialog } from '../../layout/connect-wallet-dialog/connect-wallet-dialog';
import { ShortAddressPipe } from '../../shared/pipes/short-address-pipe';
import { MasPipe } from '../../shared/pipes/units-pipe';
import { PresaleProgress } from '../../shared/ui/presale-progress/presale-progress';
import { ProjectBadges } from '../../shared/ui/project-badges/project-badges';
import { DusaCard } from '../tokens/dusa-card';
import { ProjectLogo } from '../../shared/ui/project-logo/project-logo';
import { priceNano } from '../create/collection-draft';
import { parseAddresses } from '../create/presale-draft';

type Busy =
  | 'contribute'
  | 'finalize'
  | 'claim'
  | 'refund'
  | 'withdraw'
  | 'cancel'
  | 'reclaim'
  | 'whitelist-add'
  | 'whitelist-remove'
  | 'whitelist-clear'
  | null;

/** One presale: terms, progress, and the action that fits its phase and the wallet. */
@Component({
  selector: 'app-presale-page',
  imports: [
    DusaCard,
    DatePipe,
    RouterLink,
    MasPipe,
    ShortAddressPipe,
    ProjectLogo,
    ProjectBadges,
    PresaleProgress,
    ConnectWalletDialog,
  ],
  templateUrl: './presale-page.html',
  styleUrl: './presale-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresalePage {
  private readonly launchpad = inject(LaunchpadReader);
  private readonly tokens = inject(TokenReader);
  private readonly transactions = inject(Transactions);
  protected readonly network = inject(NetworkStore);
  protected readonly wallet = inject(WalletStore);

  /** Route parameter. */
  readonly id = input.required<string>();

  /** undefined = loading, null = not found. */
  protected readonly presale = signal<Presale | null | undefined>(undefined);
  protected readonly token = signal<Project | null>(null);
  protected readonly codeRisk = computed(() => {
    const token = this.token();
    return token ? presaleCodeRisk(token) : null;
  });
  /**
   * Read from the token contract when it has no record: the admin removed it (v1.2.0+), and its
   * contributors must still be able to claim or refund.
   */
  protected readonly bare = signal<{ decimals: number; symbol: string } | null>(null);
  /** The wallet's pending contribution, nanoMAS. */
  protected readonly mine = signal(0n);
  protected readonly amount = signal('');
  protected readonly busy = signal<Busy>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly now = signal(Date.now());
  protected readonly labels = PHASE_LABELS;
  protected readonly bpsPercent = bpsPercent;
  /** The wallet is on the presale's whitelist; null when unknown or there is none. */
  protected readonly listed = signal<boolean | null>(null);
  /**
   * Closing the presale leaves its tokens for the owner to take back (Launchpad v1.8.0+), so the
   * token's code can't block refunds. False on older versions, where finalize sends them.
   */
  protected readonly pulls = signal(false);
  /** Token units the presale's owner (the wallet) can take back now. */
  protected readonly reclaimable = signal(0n);
  protected readonly reclaimableText = computed(() =>
    formatUnits(this.reclaimable(), this.decimals()),
  );
  /** Token units the wallet already claimed from a vesting presale. */
  protected readonly claimed = signal(0n);
  /** Addresses typed by the owner to add or remove. */
  protected readonly listText = signal('');
  /** Whitelist batches sent so far, and how many there are. */
  protected readonly batch = signal({ done: 0, total: 0 });
  protected readonly listNotice = signal<string | null>(null);

  protected readonly phase = computed(() => {
    const p = this.presale();
    return p ? presalePhase(p, this.now()) : null;
  });
  protected readonly decimals = computed(
    () => this.token()?.decimals ?? this.bare()?.decimals ?? 0,
  );
  protected readonly symbol = computed(() => this.token()?.symbol ?? this.bare()?.symbol ?? '');
  protected readonly isCreator = computed(
    () => !!this.presale() && this.presale()!.creator === this.wallet.address(),
  );
  protected readonly amountNano = computed(() => priceNano(this.amount()));
  protected readonly amountError = computed(() => {
    const p = this.presale();
    const amount = this.amountNano();
    if (!p || this.amount() === '') return null;
    if (amount === null) return 'Enter an amount in MAS.';
    return contributionError(p, this.mine(), amount, this.now(), this.listed() ?? true);
  });
  /** Before the public phase of a whitelist presale. */
  protected readonly whitelistPhase = computed(() => {
    const p = this.presale();
    return !!p && whitelistOnly(p, this.now());
  });
  protected readonly vesting = computed(() => {
    const p = this.presale();
    return !!p && hasVesting(p);
  });
  protected readonly vestingText = computed(() => {
    const p = this.presale();
    return p ? vestingSummary(p) : '';
  });
  /** Every unlock, with whether it has come. */
  protected readonly schedule = computed(() => {
    const p = this.presale();
    if (!p || !hasVesting(p)) return [];
    const now = this.now();
    return vestingSchedule(p).map((u) => ({ ...u, done: u.at <= now }));
  });
  /** Token units the wallet can claim now. */
  protected readonly claimableNow = computed(() => {
    const p = this.presale();
    return p ? claimable(p, this.mine(), this.claimed(), this.now()) : 0n;
  });
  protected readonly claimableText = computed(() =>
    formatUnits(this.claimableNow(), this.decimals()),
  );
  protected readonly next = computed(() => {
    const p = this.presale();
    return p ? nextUnlock(p, this.now()) : null;
  });
  /** The owner may still change the whitelist (open, before the public phase). */
  protected readonly listEditable = computed(() => {
    const p = this.presale();
    return !!p && p.whitelist && p.status === PRESALE_OPEN && this.now() < p.publicFrom;
  });
  protected readonly listParsed = computed(() => parseAddresses(this.listText()));
  protected readonly maxNow = computed(() => {
    const p = this.presale();
    return p ? maxContribution(p, this.mine()) : 0n;
  });
  /** Tokens the typed amount buys. */
  protected readonly preview = computed(() => {
    const p = this.presale();
    const amount = this.amountNano();
    return p && amount ? formatUnits(tokensFor(amount, p.rate), this.decimals()) : '';
  });
  protected readonly myTokens = computed(() => {
    const p = this.presale();
    return p ? formatUnits(tokensFor(this.mine(), p.rate), this.decimals()) : '';
  });
  protected readonly pricePerMas = computed(() => {
    const p = this.presale();
    return p ? formatUnits(p.rate, this.decimals()) : '';
  });
  protected readonly willSucceed = computed(() => {
    const p = this.presale();
    return !!p && reachesSoftCap(p);
  });

  private readonly connectDialog = viewChild.required(ConnectWalletDialog);
  private run = 0;

  constructor() {
    effect(() => {
      const id = this.id();
      this.network.network();
      const me = this.wallet.address();
      if (this.launchpad.address()) untracked(() => void this.load(id, me));
      else this.presale.set(null);
    });
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    effect((onCleanup) => onCleanup(() => clearInterval(timer)));
  }

  protected countdown(): string {
    const p = this.presale();
    const phase = this.phase();
    if (!p || !phase) return '';
    if (phase === 'upcoming') return `Starts in ${timeLeft(p.start, this.now())}`;
    if (phase === 'live') return `Ends in ${timeLeft(p.end, this.now())}`;
    return this.labels[phase];
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value.trim();
  }

  protected units(value: bigint): string {
    return formatUnits(value, this.decimals());
  }

  /** ≈ storage held by a whitelist of `count` addresses, MAS (0.007 each). */
  protected listStorage(count: number): string {
    return Number(((count * 7) / 1000).toFixed(3)).toString();
  }

  protected batchLabel(): string {
    const { done, total } = this.batch();
    return total > 1
      ? `${done + 1} of ${total}: confirm in your wallet…`
      : 'Confirm in your wallet…';
  }

  protected area(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  /** The owner adds the typed addresses (batches of 200, one signature each). */
  protected addToList(): Promise<void> {
    return this.sendList('whitelist-add', 'addToWhitelist', this.listParsed().addresses);
  }

  protected removeFromList(): Promise<void> {
    return this.sendList('whitelist-remove', 'removeFromWhitelist', this.listParsed().addresses);
  }

  /** After the presale: takes every address off, which refunds their storage to the owner. */
  protected async clearList(): Promise<void> {
    const p = this.presale();
    if (!p) return;
    this.busy.set('whitelist-clear');
    try {
      const all = await this.launchpad.whitelist(p.id);
      await this.sendList('whitelist-clear', 'removeFromWhitelist', all);
    } catch (err) {
      this.error.set(toUserMessage(err));
      this.busy.set(null);
    }
  }

  protected useMax(): void {
    this.amount.set(formatUnits(this.maxNow(), 9).replace(/,/g, ''));
  }

  protected connect(): void {
    this.connectDialog().open();
  }

  protected contribute(): Promise<void> {
    const amount = this.amountNano();
    if (!amount || this.amountError()) return Promise.resolve();
    return this.call(
      'contribute',
      new Args().addU64(this.presaleId()).addU64(amount),
      amount + CONTRIBUTE_MARGIN,
    );
  }

  protected finalize(): Promise<void> {
    return this.call('finalize', new Args().addU64(this.presaleId()), FINALIZE_COINS);
  }

  protected claim(): Promise<void> {
    return this.call('claim', new Args().addU64(this.presaleId()), CLAIM_COINS);
  }

  protected refund(): Promise<void> {
    return this.call('refund', new Args().addU64(this.presaleId()), 0n);
  }

  protected withdraw(): Promise<void> {
    return this.call(
      'withdraw',
      new Args().addU64(this.presaleId()),
      WITHDRAW_COINS,
      'withdrawRaised',
    );
  }

  protected reclaim(): Promise<void> {
    return this.call(
      'reclaim',
      new Args().addU64(this.presaleId()),
      RECLAIM_COINS,
      'reclaimTokens',
    );
  }

  protected cancel(): Promise<void> {
    return this.call('cancel', new Args().addU64(this.presaleId()), CANCEL_COINS, 'cancelPresale');
  }

  private async sendList(busy: Busy, func: string, addresses: string[]): Promise<void> {
    const target = this.launchpad.address();
    if (!target || !addresses.length || (this.listParsed().invalid && busy !== 'whitelist-clear'))
      return;
    this.busy.set(busy);
    this.error.set(null);
    this.listNotice.set(null);
    const total = Math.ceil(addresses.length / WHITELIST_BATCH);
    try {
      for (let i = 0; i < total; i++) {
        this.batch.set({ done: i, total });
        const part = addresses.slice(i * WHITELIST_BATCH, (i + 1) * WHITELIST_BATCH);
        await this.transactions.send({
          target,
          func,
          args: new Args().addU64(this.presaleId()).addArray(part, ArrayTypes.STRING),
          coins: func === 'addToWhitelist' ? whitelistCoins(part.length) : CANCEL_COINS,
        });
      }
      if (busy !== 'whitelist-clear') this.listText.set('');
      this.listNotice.set(func === 'addToWhitelist' ? 'Added.' : 'Removed.');
      await this.load(this.id(), this.wallet.address());
    } catch (err) {
      this.error.set(toUserMessage(err));
      await this.load(this.id(), this.wallet.address());
    } finally {
      this.busy.set(null);
    }
  }

  private presaleId(): bigint {
    return this.presale()?.id ?? 0n;
  }

  private async call(busy: Busy, args: Args, coins: bigint, func: string = busy!): Promise<void> {
    const target = this.launchpad.address();
    if (!target) return;
    this.busy.set(busy);
    this.error.set(null);
    try {
      await this.transactions.send({ target, func, args, coins });
      this.amount.set('');
      await this.load(this.id(), this.wallet.address());
    } catch (err) {
      this.error.set(toUserMessage(err));
    } finally {
      this.busy.set(null);
    }
  }

  private async load(id: string, me: string | null): Promise<void> {
    const run = ++this.run;
    this.error.set(null);
    if (!/^\d{1,19}$/.test(id)) {
      this.presale.set(null);
      return;
    }
    try {
      const presale = await this.launchpad.presale(BigInt(id));
      const token = await this.launchpad.projectByAddress(presale.token).catch(() => null);
      const bare = token
        ? null
        : {
            decimals: await this.tokens.decimals(presale.token),
            symbol: await this.tokens.text(presale.token, 'symbol').catch(() => ''),
          };
      const mine = me ? await this.launchpad.contribution(presale.id, me) : 0n;
      const listed =
        me && presale.whitelist ? await this.launchpad.isWhitelisted(presale.id, me) : null;
      const claimed =
        me && mine && hasVesting(presale) ? await this.launchpad.claimed(presale.id, me) : 0n;
      const pulls = await this.launchpad.supportsReclaim();
      const reclaimable =
        pulls && me === presale.creator && presale.status !== PRESALE_OPEN
          ? await this.launchpad.reclaimable(presale.id)
          : 0n;
      if (run !== this.run) return;
      this.pulls.set(pulls);
      this.reclaimable.set(reclaimable);
      this.listed.set(listed);
      this.claimed.set(claimed);
      this.presale.set(presale);
      this.token.set(token);
      this.bare.set(bare);
      this.mine.set(mine);
      this.now.set(Date.now());
    } catch (err) {
      if (run !== this.run) return;
      const message = err instanceof Error ? err.message : '';
      if (/Unknown presale/.test(message)) this.presale.set(null);
      else this.error.set(toUserMessage(err));
    }
  }
}
