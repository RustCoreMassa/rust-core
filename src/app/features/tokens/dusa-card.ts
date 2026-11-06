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
import { baseFeeBps, feePercent, formatPrice, maxFeeBps, presalePrice } from '../../core/dusa/dusa';
import { DusaPool, DusaReader } from '../../core/dusa/dusa-reader';
import { LaunchpadReader } from '../../core/launchpad/launchpad-reader';
import { PRESALE_SUCCESS, Project } from '../../core/launchpad/records';
import { NetworkStore } from '../../core/network/network-store';
import { WalletStore } from '../../core/wallet/wallet-store';
import { ShortAddressPipe } from '../../shared/pipes/short-address-pipe';
import { MasPipe, UnitsPipe } from '../../shared/pipes/units-pipe';
import { DusaLiquidityDialog } from './dusa-liquidity-dialog';

/**
 * The token's MAS pools on Dusa: price, what's in them, a link to trade there; its owner can
 * create a pool and add liquidity. Hidden on networks without Dusa.
 */
@Component({
  selector: 'app-dusa-card',
  imports: [MasPipe, UnitsPipe, ShortAddressPipe, DusaLiquidityDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (enabled()) {
      <section class="card dusa" id="dusa" aria-labelledby="dusa-heading">
        <div class="head">
          <h2 id="dusa-heading">Trade on Dusa</h2>
          @if (isOwner() && wallet.connected() && pools() !== undefined) {
            <button class="btn btn-ghost btn-sm" type="button" (click)="openDialog()">
              Add liquidity
            </button>
          }
        </div>
        @if (pools() === undefined) {
          <span class="skeleton" style="width: 60%"></span>
        } @else if (pools() === null) {
          <p class="muted small">Dusa's pools couldn't be read right now.</p>
        } @else if (pools()!.length === 0) {
          <p class="muted small">
            No {{ project().symbol }} / MAS pool on Dusa yet.
            @if (isOwner()) {
              Create one to let people trade {{ project().symbol }} after its launch or presale.
            }
          </p>
        } @else {
          <ul class="pools">
            @for (pool of pools(); track pool.pair) {
              <li>
                <div>
                  <strong>1 {{ project().symbol }} = {{ format(pool.price) }} MAS</strong>
                  <span class="muted small">
                    · {{ pool.binStep / 100 }}% bins{{
                      pool.fees ? ' · ' + fee(pool) + '% fee' : ''
                    }}
                  </span>
                </div>
                @if (pool.tokenReserve || pool.masReserve) {
                  <div class="muted small">
                    In the pool: {{ pool.tokenReserve | units: project().decimals }}
                    {{ project().symbol }} and {{ pool.masReserve | mas }}
                  </div>
                } @else {
                  <div class="muted small">
                    Empty: its price was set by whoever created it, nobody trades at it yet.
                  </div>
                }
                @if (pool.url) {
                  <a
                    class="btn btn-red btn-sm"
                    [href]="pool.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    >Open on Dusa</a
                  >
                }
              </li>
            }
          </ul>
          <p class="hint">
            Dusa is an independent exchange: prices there come from trades, not from the Launchpad.
            If Dusa doesn't list {{ project().symbol }} yet, import it there by its address:
            <button class="link mono" type="button" (click)="copy()" title="Copy the address">
              {{ copied() ? 'Copied ✓' : (project().address | shortAddress) }}</button
            >.
          </p>
        }
      </section>
      <app-dusa-liquidity-dialog (added)="load()" />
    }
  `,
  styles: `
    .dusa {
      margin-top: 20px;
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .pools {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 12px;
    }

    .pools li {
      display: grid;
      gap: 6px;
      justify-items: start;
      padding: 12px 0;
      border-top: 1px solid var(--border);
    }
  `,
})
export class DusaCard {
  private readonly dusa = inject(DusaReader);
  private readonly launchpad = inject(LaunchpadReader);
  private readonly networks = inject(NetworkStore);
  protected readonly wallet = inject(WalletStore);
  private readonly dialog = viewChild(DusaLiquidityDialog);

  readonly project = input.required<Project>();
  readonly isOwner = input(false);

  protected readonly enabled = computed(() => this.dusa.config() !== null);
  /** undefined = loading, null = couldn't be read. */
  protected readonly pools = signal<DusaPool[] | null | undefined>(undefined);
  protected readonly copied = signal(false);
  private run = 0;

  constructor() {
    effect(() => {
      this.project();
      this.networks.network();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    const run = ++this.run;
    const project = this.project();
    if (!this.dusa.config()) return;
    try {
      const pools = await this.dusa.pools(project.address, project.decimals);
      if (run === this.run) this.pools.set(pools);
    } catch {
      if (run === this.run) this.pools.set(null);
    }
  }

  protected format(price: number): string {
    return formatPrice(price);
  }

  /** The pool's trading fee range, percent: "0.8–2.49" (base, and with the most volatility). */
  protected fee(pool: DusaPool): string {
    if (!pool.fees) return '';
    const low = feePercent(baseFeeBps(pool.fees, pool.binStep));
    return `${low}–${feePercent(maxFeeBps(pool.fees, pool.binStep))}`;
  }

  protected async copy(): Promise<void> {
    await navigator.clipboard?.writeText(this.project().address).catch(() => undefined);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  protected async openDialog(): Promise<void> {
    const project = this.project();
    // A new pool starts, by default, at the price of the token's last successful presale.
    const presales = await this.launchpad.allPresales().catch(() => []);
    const last = presales
      .filter((p) => p.token === project.address && p.status === PRESALE_SUCCESS)
      .at(-1);
    this.dialog()?.open(
      project,
      this.pools() ?? [],
      last ? presalePrice(last.rate, project.decimals) : 0,
    );
  }
}
