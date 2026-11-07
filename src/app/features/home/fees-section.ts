import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HolderDiscountStore } from '../../core/launchpad/holder-discount';
import { LaunchpadReader } from '../../core/launchpad/launchpad-reader';
import { LaunchpadConfig } from '../../core/launchpad/records';
import { NetworkStore } from '../../core/network/network-store';
import { formatUnits } from '../../core/utils/token-amount';
import { ShortAddressPipe } from '../../shared/pipes/short-address-pipe';
import { Icon } from '../../shared/ui/icon/icon';

/** The Launchpad's rules and its current fees, read from the contract of the selected network. */
@Component({
  selector: 'app-fees-section',
  imports: [RouterLink, ShortAddressPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (launchpad.address(); as address) {
      <section class="container section" id="fees" aria-labelledby="fees-title">
        <div class="grid">
          <div class="rules">
            <span class="label">The Launchpad contract</span>
            <h2 id="fees-title">Rules in code, changes in public</h2>
            <ul>
              @for (rule of rules; track rule.title) {
                <li>
                  <span class="icon-tile"><app-icon [name]="rule.icon" /></span>
                  <span
                    ><strong>{{ rule.title }}</strong> {{ rule.text }}</span
                  >
                </li>
              }
            </ul>
          </div>

          <div class="card fees">
            <div class="fees-head">
              <h3>Fees on {{ networks.config().label }}</h3>
              @if (version(); as v) {
                <span class="pill">contract v{{ v }}</span>
              }
            </div>
            <dl class="rows">
              @for (fee of fees(); track fee.label) {
                <div>
                  <dt>{{ fee.label }}</dt>
                  <dd>
                    @if (fee.value; as value) {
                      {{ value }}
                    } @else if (config() === undefined) {
                      <span class="skeleton"></span>
                    } @else {
                      <span class="muted">—</span>
                    }
                  </dd>
                </div>
              }
            </dl>
            @if (discountPercent(); as percent) {
              <p class="perk">
                <span class="node" aria-hidden="true"></span>
                <span
                  >Holders of a
                  @if (membershipAddress(); as m) {
                    <a [routerLink]="['/collections', m]">{{ membershipName() }}</a>
                  } @else {
                    membership
                  }
                  NFT pay <strong>{{ percent }}% less</strong> on each.</span
                >
              </p>
            }
            <p class="note">
              Everything else costs only the Massa network fee and storage. Every operation shows
              its cost before you sign.
            </p>
            <div class="well address">
              <span class="muted">Contract</span>
              <code [title]="address">{{ address | shortAddress }}</code>
              <button class="btn btn-ghost btn-sm" type="button" (click)="copy(address)">
                {{ copied() ? 'Copied' : 'Copy' }}
              </button>
            </div>
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 48px;
      align-items: start;
    }

    h2 {
      margin-top: 18px;
      font-size: clamp(28px, 4vw, 40px);
    }

    .rules ul {
      display: grid;
      gap: 18px;
      margin: 28px 0 0;
      padding: 0;
      list-style: none;
    }

    .rules li {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      color: var(--gray-500);
      font-size: 15px;
    }

    .rules strong {
      display: block;
      margin-bottom: 2px;
      color: var(--white);
      font-size: 16px;
    }

    .rules .icon-tile {
      --tile: 42px;
    }

    .fees {
      padding: 28px;
    }

    .fees-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
    }

    .fees-head h3 {
      font-size: 20px;
    }

    .rows dd .skeleton {
      width: 80px;
    }

    .perk {
      display: flex;
      gap: 12px;
      align-items: center;
      margin: 16px 0 0;
      padding: 12px 14px;
      border-radius: var(--radius-md);
      border: 1px solid var(--ember-line);
      background: linear-gradient(180deg, rgba(255, 106, 61, 0.1), rgba(255, 106, 61, 0.03));
      font-size: 14px;
    }

    .perk a {
      color: var(--white);
      text-decoration-color: var(--ember-line);
      text-underline-offset: 3px;
    }

    .note {
      margin: 14px 0 0;
      color: var(--gray-500);
      font-size: 13px;
    }

    .address {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 18px;
      padding: 8px 8px 8px 14px;
      font-size: 13px;
    }

    .address code {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @media (max-width: 980px) {
      .grid {
        grid-template-columns: 1fr;
        gap: 32px;
      }
    }
  `,
})
export class FeesSection {
  protected readonly launchpad = inject(LaunchpadReader);
  protected readonly networks = inject(NetworkStore);
  private readonly discount = inject(HolderDiscountStore);

  /** undefined while it's read, null when the read failed. */
  protected readonly config = signal<LaunchpadConfig | null | undefined>(undefined);
  protected readonly version = signal<string | null>(null);
  protected readonly copied = signal(false);
  private run = 0;

  protected readonly fees = computed(() => {
    const c = this.config();
    const mas = (nano: bigint) => `${formatUnits(nano, 9)} MAS`;
    return [
      { label: 'Launch a token', value: c && mas(c.tokenFee) },
      { label: 'Launch a collection', value: c && mas(c.collectionFee) },
      { label: 'Import a token or collection', value: c && mas(c.importFee) },
      { label: 'Presale', value: c && `${c.presaleFeeBps / 100}% of the MAS raised` },
      { label: 'Marketplace sale', value: c && `${c.marketFeeBps / 100}% of the price` },
    ];
  });

  protected readonly discountPercent = computed(() => (this.discount.program()?.bps ?? 0) / 100);
  protected readonly membershipAddress = computed(
    () => this.discount.program()?.collection ?? this.networks.config().membership?.address ?? null,
  );
  protected readonly membershipName = computed(() => {
    const membership = this.networks.config().membership;
    return membership && membership.address === this.membershipAddress()
      ? membership.name
      : 'membership';
  });

  protected readonly rules = [
    {
      icon: 'crown',
      title: 'You own what you launch.',
      text: 'The Launchpad can’t mint, pause, freeze or change your contract.',
    },
    {
      icon: 'eye',
      title: 'No backend.',
      text: 'Everything is read straight from the blockchain — no RustCore server, no database, no tracking.',
    },
    {
      icon: 'code',
      title: 'Verifiable launches.',
      text: 'Versioned templates with their hash on-chain: download the original code of any launch and rebuild it byte for byte.',
    },
    {
      icon: 'clock',
      title: 'Escrow nobody can touch.',
      text: 'Presale MAS stay in the contract until claims or refunds; the Launchpad’s own code changes only after a 72-hour public delay.',
    },
    {
      icon: 'flag',
      title: 'Warnings where they matter.',
      text: 'Imported code, look-alike symbols and listings that can’t be bought are flagged.',
    },
  ] as const;

  constructor() {
    effect(() => {
      const address = this.launchpad.address();
      untracked(() => void this.load(address));
    });
  }

  protected async copy(address: string): Promise<void> {
    await navigator.clipboard?.writeText(address).catch(() => undefined);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1800);
  }

  private async load(address: string | null): Promise<void> {
    const run = ++this.run;
    this.config.set(undefined);
    this.version.set(null);
    if (!address) return;
    const [config, version] = await Promise.all([
      this.launchpad.config().catch(() => null),
      this.launchpad.version().catch(() => null),
    ]);
    if (run !== this.run) return;
    this.config.set(config);
    this.version.set(version);
  }
}
