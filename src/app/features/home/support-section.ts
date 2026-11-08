import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HolderDiscountStore } from '../../core/launchpad/holder-discount';
import { DONATION_ADDRESS, LINKS } from '../../core/links';
import { NetworkStore } from '../../core/network/network-store';

/** Voluntary donations, and where to check the address. */
@Component({
  selector: 'app-support-section',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="container section" id="support" aria-labelledby="support-title">
      <div class="card support">
        <div class="glow" aria-hidden="true"></div>
        <div class="text">
          <span class="label">Support the project</span>
          <h2 id="support-title">Help fund what's next</h2>
          <p>
            RustCore Wallet is free. Voluntary donations in MAS or any Massa token help fund the
            mobile apps, new tools and independent security audits. They unlock nothing and lower no
            fee — the tools are the same for everyone.
            @if (membership(); as m) {
              Want something back? A
              <a [routerLink]="['/collections', m.address]">{{ m.name }}</a> NFT supports the same
              work{{
                discountPercent() ? ' and takes ' + discountPercent() + '% off Launchpad fees' : ''
              }}.
            }
          </p>
        </div>
        <div class="donate">
          <span class="donate-label">Donation address</span>
          <div class="well donate-row">
            <code>{{ address }}</code>
            <button class="btn btn-red btn-sm" type="button" (click)="copy()">
              {{ copied() ? 'Copied' : 'Copy' }}
            </button>
          </div>
          <p class="warn">
            Always check it against the
            <a [href]="links.donationReadme" target="_blank" rel="noopener noreferrer"
              >README in the official repository</a
            >. Nobody from RustCore will ever DM you asking for funds.
          </p>
        </div>
      </div>
    </section>
  `,
  styles: `
    .support {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 40px;
      align-items: center;
      padding: 44px;
      overflow: hidden;
    }

    .glow {
      position: absolute;
      right: -120px;
      bottom: -160px;
      width: 460px;
      height: 360px;
      border-radius: 50%;
      background: radial-gradient(ellipse, rgba(255, 90, 54, 0.28), transparent 68%);
      pointer-events: none;
    }

    .text,
    .donate {
      position: relative;
    }

    h2 {
      margin-top: 18px;
      font-size: clamp(26px, 3.6vw, 36px);
    }

    .text p {
      margin: 14px 0 0;
      color: var(--gray-300);
    }

    a {
      color: var(--white);
      text-decoration-color: var(--ember-line);
      text-underline-offset: 3px;
    }

    .donate-label {
      color: var(--gray-500);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .donate-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 10px;
      padding: 8px 8px 8px 16px;
    }

    .donate-row code {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
      color: var(--ember-text);
      font-size: 13px;
    }

    .warn {
      margin: 12px 0 0;
      color: var(--gray-500);
      font-size: 13px;
    }

    @media (max-width: 900px) {
      .support {
        grid-template-columns: 1fr;
        padding: 28px 22px;
      }
    }
  `,
})
export class SupportSection {
  protected readonly links = LINKS;
  protected readonly address = DONATION_ADDRESS;
  protected readonly copied = signal(false);
  private readonly discount = inject(HolderDiscountStore);
  private readonly networks = inject(NetworkStore);

  protected readonly discountPercent = computed(() => (this.discount.program()?.bps ?? 0) / 100);
  protected readonly membership = computed(() => this.networks.config().membership);

  protected async copy(): Promise<void> {
    await navigator.clipboard?.writeText(this.address).catch(() => undefined);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1800);
  }
}
