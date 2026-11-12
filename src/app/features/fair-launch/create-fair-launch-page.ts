import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Args, StorageCost } from '@massalabs/massa-web3';
import {
  CREATE_MARGIN,
  DEFAULT_SLIPPAGE_BPS,
  TOKEN_DECIMALS,
  feeOf,
  quoteBuy,
  withSlippage,
} from '../../core/fairlaunch/curve';
import { FairLaunchReader } from '../../core/fairlaunch/fair-launch-reader';
import { FairConfig } from '../../core/fairlaunch/records';
import {
  descriptionError,
  nameError,
  parseSupply,
  symbolError,
  urlError,
} from '../../core/launchpad/launch-rules';
import { LaunchpadReader } from '../../core/launchpad/launchpad-reader';
import { EMPTY_INFO, KIND_TOKEN, ProjectInfo, writeInfo } from '../../core/launchpad/records';
import { assertKnownTemplate } from '../../core/launchpad/templates';
import { Transactions, eventFields } from '../../core/launchpad/transactions';
import { NetworkStore } from '../../core/network/network-store';
import { formatUnits } from '../../core/utils/token-amount';
import { toUserMessage } from '../../core/utils/user-error';
import { WalletStore } from '../../core/wallet/wallet-store';
import { ConnectWalletDialog } from '../../layout/connect-wallet-dialog/connect-wallet-dialog';
import { MasPipe } from '../../shared/pipes/units-pipe';

type Field = 'name' | 'symbol' | 'description' | 'logoUrl' | 'website' | 'twitter' | 'telegram';

/** Launches a token on the Fair Launch curve in one transaction. */
@Component({
  selector: 'app-create-fair-launch-page',
  imports: [RouterLink, MasPipe, ConnectWalletDialog],
  templateUrl: './create-fair-launch-page.html',
  styleUrl: './create-fair-launch-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateFairLaunchPage {
  protected readonly fair = inject(FairLaunchReader);
  protected readonly network = inject(NetworkStore);
  protected readonly wallet = inject(WalletStore);
  private readonly transactions = inject(Transactions);
  private readonly router = inject(Router);
  private readonly connectDialog = viewChild.required(ConnectWalletDialog);

  private readonly launchpad = inject(LaunchpadReader);

  protected readonly config = signal<FairConfig | null>(null);
  /** Storage of the new token contract (the Launchpad's token template), nanoMAS. */
  protected readonly contractStorage = signal<bigint | null>(null);
  protected readonly contractCost = computed(() => {
    const storage = this.contractStorage();
    const c = this.config();
    return storage === null || !c ? null : storage + c.deployDeposit;
  });
  protected readonly form = signal<Record<Field, string>>({
    name: '',
    symbol: '',
    description: '',
    logoUrl: '',
    website: '',
    twitter: '',
    telegram: '',
  });
  /** MAS the creator buys at once (optional). */
  protected readonly devBuy = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly errors = computed(() => {
    const f = this.form();
    return {
      name: nameError(f.name),
      symbol: symbolError(f.symbol),
      description: descriptionError(f.description),
      logoUrl: urlError(f.logoUrl),
      website: urlError(f.website),
      twitter: urlError(f.twitter),
      telegram: urlError(f.telegram),
    } as Record<Field, string | null>;
  });
  protected readonly devBuyNano = computed(() =>
    this.devBuy().trim() === '' ? 0n : parseSupply(this.devBuy(), 9),
  );
  protected readonly devBuyError = computed(() =>
    this.devBuyNano() === null ? 'Enter an amount of MAS, like 25.' : null,
  );
  protected readonly invalid = computed(
    () => Object.values(this.errors()).some((e) => e !== null) || !!this.devBuyError(),
  );

  /** What the dev buy gets on a fresh curve. */
  protected readonly devTokens = computed(() => {
    const c = this.config();
    const mas = this.devBuyNano();
    if (!c || !mas) return 0n;
    return quoteBuy({ virtualMas: c.targetMas / 3n, masIn: 0n, sold: 0n }, mas).tokens;
  });
  protected readonly devTokensText = computed(() =>
    formatUnits(this.devTokens(), TOKEN_DECIMALS).replace(/\.\d+$/, ''),
  );

  /** Fee + the token contract's storage and deposit + dev buy and its fee, before the record. */
  protected readonly cost = computed(() => {
    const c = this.config();
    const storage = this.contractStorage();
    if (!c || storage === null) return null;
    const dev = this.devBuyNano() ?? 0n;
    return c.creationFee + c.deployDeposit + storage + dev + feeOf(dev, c.tradeFeeBps);
  });

  constructor() {
    effect(() => {
      this.network.network();
      const address = this.fair.address();
      untracked(() => {
        this.config.set(null);
        this.contractStorage.set(null);
        if (address) void this.loadCosts();
      });
    });
  }

  private async loadCosts(): Promise<void> {
    try {
      const config = await this.fair.config();
      // The token is deployed from the Launchpad's newest token template: its size is the cost.
      const template = await this.launchpad.template(KIND_TOKEN);
      if (template.version === 0) throw new Error('Token launches are not open yet.');
      assertKnownTemplate(KIND_TOKEN, template.hash);
      const code = await this.launchpad.templateCode(KIND_TOKEN, template.version);
      this.config.set(config);
      this.contractStorage.set(StorageCost.smartContractDeploy(code.length));
    } catch (err) {
      this.error.set(toUserMessage(err));
    }
  }

  protected set(field: Field, event: Event): void {
    let value = (event.target as HTMLInputElement).value;
    if (field === 'symbol') value = value.toUpperCase();
    else if (field === 'name') value = value.replace(/^\s+/, '');
    this.form.update((f) => ({ ...f, [field]: value }));
  }

  protected setDevBuy(event: Event): void {
    this.devBuy.set((event.target as HTMLInputElement).value);
  }

  protected connect(): void {
    this.connectDialog().open();
  }

  protected async launch(): Promise<void> {
    const target = this.fair.address();
    const cost = this.cost();
    const dev = this.devBuyNano();
    if (!target || cost === null || dev === null || this.invalid()) return;
    const f = this.form();
    const info: ProjectInfo = {
      ...EMPTY_INFO,
      description: f.description,
      logoUrl: f.logoUrl,
      website: f.website,
      twitter: f.twitter,
      telegram: f.telegram,
    };
    const args = writeInfo(new Args().addString(f.name.trim()).addString(f.symbol), info)
      .addU64(dev)
      .addU64(withSlippage(this.devTokens(), DEFAULT_SLIPPAGE_BPS));
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.transactions.send({
        target,
        func: 'createLaunch',
        args,
        coins: cost + CREATE_MARGIN,
      });
      const [id] = eventFields(result.events, 'LAUNCH_CREATED') ?? [];
      await this.router.navigate(id ? ['/launch', id] : ['/launch']);
    } catch (err) {
      this.error.set(toUserMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
