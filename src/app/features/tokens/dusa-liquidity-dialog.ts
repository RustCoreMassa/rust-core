import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Args } from '@massalabs/massa-web3';
import {
  CREATE_PAIR_COINS,
  DEADLINE_MS,
  DusaFees,
  LiquidityShape,
  SHAPE_BINS,
  SLIPPAGE_BPS,
  WMAS_DECIMALS,
  addLiquidityCall,
  addLiquidityStorage,
  baseFeeBps,
  createPairArgs,
  feePercent,
  maxFeeBps,
  formatPrice,
  idFromPrice,
  lpFeeText,
  poolPriceWarning,
  idSlippage,
  priceFromId,
  uniformDistribution,
} from '../../core/dusa/dusa';
import { DusaPool, DusaReader } from '../../core/dusa/dusa-reader';
import { parseSupply } from '../../core/launchpad/launch-rules';
import { ALLOWANCE_COINS } from '../../core/launchpad/presale-cost';
import { Project } from '../../core/launchpad/records';
import { TokenReader } from '../../core/launchpad/token-reader';
import { Transactions } from '../../core/launchpad/transactions';
import { toUserMessage } from '../../core/utils/user-error';
import { WalletStore } from '../../core/wallet/wallet-store';
import { MasPipe, UnitsPipe } from '../../shared/pipes/units-pipe';

type Busy = 'pair' | 'approve' | 'add' | null;

/**
 * Adds the owner's token and MAS to a Dusa pool, creating the pool first when there is none at
 * the chosen bin step. The liquidity goes to the owner's wallet (they can remove it on Dusa);
 * the Launchpad isn't involved. Up to three signatures: create the pool, allow the router to
 * take the tokens, add the liquidity.
 */
@Component({
  selector: 'app-dusa-liquidity-dialog',
  imports: [MasPipe, UnitsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog class="sheet" #dialog aria-labelledby="dusa-title">
      @if (project(); as p) {
        <div class="sheet-body">
          <div class="sheet-head">
            <h2 id="dusa-title">Add liquidity on Dusa</h2>
            <button class="icon-btn" type="button" aria-label="Close" (click)="close()">✕</button>
          </div>
          <p class="hint">
            {{ p.symbol }} / MAS on Dusa, Massa's exchange. The position goes to your wallet: you
            can remove it on Dusa at any time.
          </p>

          <div class="field">
            <span class="field-label">Pool</span>
            <div class="chips">
              @for (step of steps(); track step) {
                <button
                  type="button"
                  class="chip"
                  [class.selected]="binStep() === step"
                  (click)="pick(step)"
                >
                  {{ step / 100 }}% bins{{ poolAt(step) ? '' : ' · new' }}
                </button>
              }
            </div>
            <span class="hint">
              The price moves by this much from one bin to the next: wider bins suit young, volatile
              tokens.
              @if (steps().includes(100)) {
                For a new token Dusa suggests 1% bins, or 0.5% for lower trading fees.
              }
            </span>
            @if (fees(); as f) {
              <span class="hint">
                Trading fee {{ feeRange(f) }}%: the more the price moves, the higher.
                {{ lpText(f) }}
              </span>
            }
          </div>

          @if (pool(); as existing) {
            <p class="hint">
              Current price: 1 {{ p.symbol }} = {{ format(existing.price) }} MAS. Your liquidity
              goes around it.
            </p>
            @if (warning(); as text) {
              <div class="notice notice-error" role="alert">
                {{ text }}
                <label class="confirm">
                  <input
                    type="checkbox"
                    [checked]="accepted()"
                    (change)="accepted.set(checked($event))"
                  />
                  I checked this price and want to add at it.
                </label>
              </div>
            }
          } @else {
            <label class="field">
              <span>Starting price (MAS per {{ p.symbol }})</span>
              <input
                class="input"
                inputmode="decimal"
                placeholder="0.001"
                [value]="price()"
                (input)="price.set(value($event))"
              />
              @if (priceError(); as error) {
                <span class="error">{{ error }}</span>
              } @else if (suggested()) {
                <span class="hint">Your last presale's price, as a start.</span>
              }
            </label>
          }

          <div class="form-grid">
            <label class="field">
              <span>{{ p.symbol }}</span>
              <input
                class="input"
                inputmode="decimal"
                placeholder="0"
                [value]="tokenText()"
                (input)="tokenText.set(value($event))"
              />
              @if (tokenError(); as error) {
                <span class="error">{{ error }}</span>
              } @else if (tokenBalance() !== null) {
                <span class="hint">You hold {{ tokenBalance() | units: p.decimals }}</span>
              }
            </label>
            <label class="field">
              <span>MAS</span>
              <input
                class="input"
                inputmode="decimal"
                placeholder="0"
                [value]="masText()"
                (input)="masText.set(value($event))"
              />
              @if (masError(); as error) {
                <span class="error">{{ error }}</span>
              }
            </label>
          </div>

          <div class="field">
            <span class="field-label">Range</span>
            <div class="chips">
              <button
                type="button"
                class="chip"
                [class.selected]="shape() === 'narrow'"
                (click)="shape.set('narrow')"
              >
                Narrow
              </button>
              <button
                type="button"
                class="chip"
                [class.selected]="shape() === 'wide'"
                (click)="shape.set('wide')"
              >
                Wide
              </button>
            </div>
            @if (range(); as r) {
              <span class="hint">
                From {{ format(r.low) }} to {{ format(r.high) }} MAS per {{ p.symbol }}:
                {{ p.symbol }} is sold as the price rises above the start, MAS buys as it falls
                below.
              </span>
            }
          </div>

          <dl class="rows">
            <div>
              <dt>Storage on Dusa</dt>
              <dd>up to {{ storage() | mas }}, the unused part comes back</dd>
            </div>
            @if (!pool()) {
              <div>
                <dt>Creating the pool</dt>
                <dd>up to {{ createCoins | mas }}, the unused part comes back</dd>
              </div>
            }
          </dl>

          @if (error(); as message) {
            <div class="notice notice-error" role="alert">{{ message }}</div>
          }
          <div class="actions">
            <button
              class="btn btn-red"
              type="button"
              [disabled]="!ready() || busy()"
              (click)="add()"
            >
              @switch (busy()) {
                @case ('pair') {
                  Create the pool in your wallet…
                }
                @case ('approve') {
                  Allow {{ p.symbol }} in your wallet…
                }
                @case ('add') {
                  Add the liquidity in your wallet…
                }
                @default {
                  {{ pool() ? 'Add liquidity' : 'Create the pool and add liquidity' }}
                }
              }
            </button>
            <button class="btn btn-ghost" type="button" (click)="close()">Cancel</button>
          </div>
        </div>
      }
    </dialog>
  `,
  styles: `
    .confirm {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 10px;
      font-weight: 600;
    }
  `,
})
export class DusaLiquidityDialog {
  private readonly dusa = inject(DusaReader);
  private readonly tokens = inject(TokenReader);
  private readonly transactions = inject(Transactions);
  private readonly wallet = inject(WalletStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly added = output<void>();

  protected readonly createCoins = CREATE_PAIR_COINS;
  protected readonly project = signal<Project | null>(null);
  private readonly pools = signal<readonly DusaPool[]>([]);
  /** Fee settings a new pool gets, by bin step (read from Dusa's Factory when opening). */
  private readonly presets = signal<ReadonlyMap<number, DusaFees | null>>(new Map());
  protected readonly binStep = signal(0);
  protected readonly price = signal('');
  protected readonly suggested = signal(false);
  /** The owner's expected price (their last successful presale's), 0 when unknown. */
  private readonly reference = signal(0);
  /** The owner confirmed adding to a pool whose price looks off. */
  protected readonly accepted = signal(false);
  protected readonly tokenText = signal('');
  protected readonly masText = signal('');
  protected readonly shape = signal<LiquidityShape>('wide');
  protected readonly tokenBalance = signal<bigint | null>(null);
  protected readonly busy = signal<Busy>(null);
  protected readonly error = signal<string | null>(null);

  /** Every bin step open on this network, plus those of pools that already exist. */
  protected readonly steps = computed(() => {
    const open = this.dusa.config()?.binSteps ?? [];
    return [...new Set([...open, ...this.pools().map((p) => p.binStep)])].sort((a, b) => a - b);
  });
  protected readonly pool = computed(() => this.poolAt(this.binStep()));
  /** The chosen pool's own fee settings, or those a new one would get. */
  protected readonly fees = computed(() => {
    const pool = this.pool();
    return pool ? pool.fees : (this.presets().get(this.binStep()) ?? null);
  });
  /** A second look before adding to a pool whose price may have been set by someone else. */
  protected readonly warning = computed(() => {
    const pool = this.pool();
    return pool ? poolPriceWarning(pool, this.reference()) : null;
  });
  private readonly decimals = computed(() => this.project()?.decimals ?? 0);

  private readonly startId = computed(() => {
    const pool = this.pool();
    if (pool) return pool.activeId;
    const price = Number(this.price().replace(/,/g, ''));
    return idFromPrice(price, this.binStep(), this.decimals(), WMAS_DECIMALS);
  });
  protected readonly priceError = computed(() =>
    this.pool() || !this.price() || this.startId() !== null ? null : 'Enter a price above 0.',
  );
  private readonly tokenUnits = computed(() => this.amount(this.tokenText(), this.decimals()));
  private readonly masUnits = computed(() => this.amount(this.masText(), WMAS_DECIMALS));
  protected readonly tokenError = computed(() => {
    const units = this.tokenUnits();
    if (units === null) return 'Enter a number.';
    const balance = this.tokenBalance();
    return balance !== null && units > balance ? 'More than you hold.' : null;
  });
  protected readonly masError = computed(() =>
    this.masUnits() === null ? 'Enter a number.' : null,
  );

  protected readonly range = computed(() => {
    const id = this.startId();
    if (id === null) return null;
    const n = SHAPE_BINS[this.shape()];
    const at = (bin: number) => priceFromId(bin, this.binStep(), this.decimals(), WMAS_DECIMALS);
    return { low: at(id - n), high: at(id + n) };
  });
  protected readonly storage = computed(() =>
    addLiquidityStorage(2 * SHAPE_BINS[this.shape()] + 1),
  );
  protected readonly ready = computed(
    () =>
      this.startId() !== null &&
      (!this.warning() || this.accepted()) &&
      !this.tokenError() &&
      !this.masError() &&
      ((this.tokenUnits() ?? 0n) > 0n || (this.masUnits() ?? 0n) > 0n),
  );

  /** `suggestedPrice`: MAS per token to start a new pool at (a presale's price), 0 for none. */
  open(project: Project, pools: readonly DusaPool[], suggestedPrice: number): void {
    this.project.set(project);
    this.pools.set(pools);
    const steps = this.dusa.config()?.binSteps ?? [];
    // An existing pool first (adding to it is what people usually want), else the widest bins.
    this.binStep.set(pools[0]?.binStep ?? steps.at(-1) ?? 0);
    this.price.set(suggestedPrice > 0 ? formatPrice(suggestedPrice).replace(/,/g, '') : '');
    this.suggested.set(suggestedPrice > 0);
    this.reference.set(suggestedPrice);
    this.accepted.set(false);
    this.tokenText.set('');
    this.masText.set('');
    this.error.set(null);
    this.tokenBalance.set(null);
    this.presets.set(new Map());
    void Promise.all(
      this.steps().map(async (step) => [step, await this.dusa.preset(step)] as const),
    )
      .then((entries) => this.presets.set(new Map(entries)))
      .catch(() => undefined);
    const me = this.wallet.address();
    if (me)
      void this.tokens
        .balanceOf(project.address, me)
        .then((b) => this.tokenBalance.set(b))
        .catch(() => undefined);
    this.dialog().nativeElement.showModal();
  }

  protected pick(step: number): void {
    this.binStep.set(step);
    this.accepted.set(false);
  }

  protected poolAt(step: number): DusaPool | null {
    return this.pools().find((p) => p.binStep === step) ?? null;
  }

  protected format(price: number): string {
    return formatPrice(price);
  }

  /** "0.8 to 2.49": the base fee, and the fee with the most volatility. */
  protected feeRange(fees: DusaFees): string {
    const step = this.binStep();
    return `${feePercent(baseFeeBps(fees, step))} to ${feePercent(maxFeeBps(fees, step))}`;
  }

  protected lpText(fees: DusaFees): string {
    return lpFeeText(fees);
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  private amount(text: string, decimals: number): bigint | null {
    return text.trim() === '' ? 0n : parseSupply(text, decimals);
  }

  protected async add(): Promise<void> {
    const project = this.project();
    const dusa = this.dusa.config();
    const me = this.wallet.address();
    const startId = this.startId();
    if (!project || !dusa || !me || startId === null || !this.ready()) return;
    const binStep = this.binStep();
    const tokenAmount = this.tokenUnits() ?? 0n;
    this.error.set(null);
    let created = false;
    try {
      if (!this.pool()) {
        this.busy.set('pair');
        await this.transactions.send({
          target: dusa.router,
          func: 'createLBPair',
          args: createPairArgs(project.address, dusa.wmas, startId, binStep),
          coins: CREATE_PAIR_COINS,
        });
        created = true;
      }
      if (tokenAmount > 0n) {
        const allowance = await this.tokens.allowance(project.address, me, dusa.router);
        if (allowance < tokenAmount) {
          this.busy.set('approve');
          await this.transactions.send({
            target: project.address,
            func: 'increaseAllowance',
            args: new Args().addString(dusa.router).addU256(tokenAmount - allowance),
            coins: ALLOWANCE_COINS,
          });
        }
      }
      this.busy.set('add');
      const call = addLiquidityCall({
        token: project.address,
        wmas: dusa.wmas,
        binStep,
        tokenAmount,
        masAmount: this.masUnits() ?? 0n,
        activeId: startId,
        idSlippage: idSlippage(SLIPPAGE_BPS, binStep),
        distribution: uniformDistribution(SHAPE_BINS[this.shape()]),
        to: me,
        deadline: Date.now() + DEADLINE_MS,
        slippageBps: SLIPPAGE_BPS,
      });
      await this.transactions.send({ target: dusa.router, func: 'addLiquidityMAS', ...call });
      this.added.emit();
      this.close();
    } catch (err) {
      this.error.set(toUserMessage(err));
      if (created) {
        // The pool exists now even though a later step failed: a retry adds to it.
        this.pools.set(await this.dusa.pools(project.address, project.decimals).catch(() => []));
        this.added.emit();
      }
    } finally {
      this.busy.set(null);
    }
  }
}
