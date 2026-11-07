import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HolderDiscountStore } from '../../core/launchpad/holder-discount';
import { LaunchpadReader } from '../../core/launchpad/launchpad-reader';
import { LINKS } from '../../core/links';
import { NetworkStore } from '../../core/network/network-store';

/** Questions people ask before trusting a wallet or a launch. */
@Component({
  selector: 'app-faq-section',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="container section" id="faq" aria-labelledby="faq-title">
      <div class="section-head">
        <span class="label">FAQ</span>
        <h2 id="faq-title">Questions</h2>
        <p>
          Can't find your answer? Ask in our
          <a [href]="links.telegram" target="_blank" rel="noopener noreferrer">Telegram group</a>,
          write to us on <a [href]="links.x" target="_blank" rel="noopener noreferrer">X</a> or open
          an issue on <a [href]="links.github" target="_blank" rel="noopener noreferrer">GitHub</a>.
        </p>
      </div>

      <div class="faq">
        <details class="card" name="faq">
          <summary>Does RustCore charge anything?</summary>
          <p>
            The wallet: no. Each transaction pays the Massa network fee, and swaps also send the
            small storage deposit the Dusa exchange requires. Registering a .massa name costs the
            fee set by the Massa Name System. Nothing goes to RustCore.
          </p>
          <p>
            The Launchpad charges five operations: launching a token or a collection, importing one,
            a share of the MAS a presale raises and of each marketplace sale — the amounts are in
            <a routerLink="/" fragment="fees">Fees</a>, and each shows before you sign.
            @if (discountPercent(); as percent) {
              Holders of a {{ membershipName() }} NFT pay {{ percent }}% less on each.
            }
          </p>
        </details>

        <details class="card" name="faq">
          <summary>Can RustCore see or recover my funds?</summary>
          <p>
            No. Your keys never leave your device and there is no RustCore server. That also means
            nobody can recover a lost key — back yours up and keep it offline. A forgotten PIN or
            password can't be recovered either: “Forgot your PIN / password?” on the wallet's lock
            screen erases the wallets on that device, and you import them again with their private
            keys.
          </p>
          <p>
            The Launchpad holds MAS only in presale escrow, and its admin can't touch it — only the
            fees collected.
          </p>
        </details>

        <details class="card" name="faq">
          <summary>Is the code open source?</summary>
          <p>
            It's source-available under the Functional Source License (FSL-1.1-ALv2): anyone can
            read, audit, run and modify it, but not use it for a competing product. Each release
            becomes open source under Apache-2.0 two years after it's published.
          </p>
        </details>

        <details class="card" name="faq">
          <summary>Have the wallet and the Launchpad been audited?</summary>
          <p>
            Not yet — independent security audits are on the roadmap. Both have had internal
            security reviews, and their fixes are published in each release's notes. Start with
            small amounts and always keep a backup of your private keys.
          </p>
        </details>

        <details class="card" name="faq">
          <summary>Which address is official?</summary>
          <p>
            <strong>rustcore.massa</strong> is RustCore's address — this app, with the Launchpad and
            every tool to come — and <strong>wrustcore.massa</strong> is the wallet's. The browser
            extension's only official listing is
            <a [href]="links.walletChrome" target="_blank" rel="noopener noreferrer"
              >this one on the Chrome Web Store</a
            >.
            @if (launchpadAddress(); as address) {
              The Launchpad contract on {{ networkLabel() }} is <code>{{ address }}</code
              >.
            }
            A copy on any other address could steal your keys or funds — never enter your PIN,
            password or private key anywhere else.
          </p>
        </details>

        <details class="card" name="faq">
          <summary>Who owns a token launched here?</summary>
          <p>
            You do, from the first block: your wallet is the contract's owner. Anyone can launch
            anything, though — check the address, the <em>Verified</em> badge and the
            <em>Imported</em>, <em>Mutable</em> and <em>Look-alike symbol</em> warnings.
          </p>
        </details>

        <details class="card" name="faq">
          <summary>Is a {{ membershipName() }} NFT an investment?</summary>
          <p>
            No. It's art and a supporter badge: the mint funds RustCore's work.
            @if (discountPercent(); as percent) {
              While you hold one, the Launchpad takes {{ percent }}% off its fees — a rate set in
              the Launchpad contract, which may change.
            }
            Nothing promises the NFT a price.
          </p>
        </details>

        <details class="card" name="faq">
          <summary>Is RustCore part of Massa Labs?</summary>
          <p>No. RustCore is an independent team, not affiliated with Massa Labs or Dusa.</p>
        </details>
      </div>
    </section>
  `,
  styles: `
    .section-head a {
      color: var(--white);
      text-decoration-color: var(--ember-line);
      text-underline-offset: 3px;
    }

    .faq {
      display: grid;
      gap: 10px;
      max-width: 820px;
      margin: 0 auto;
    }

    details {
      padding: 0;
      transition: border-color 0.25s ease;
    }

    details[open] {
      border-color: var(--ember-line);
    }

    summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 22px;
      font: 600 17px/1.35 var(--font-display);
      list-style: none;
      cursor: pointer;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    /* A plus in a matte tile that turns into a minus. */
    summary::after {
      content: '';
      flex: none;
      width: 30px;
      height: 30px;
      border-radius: 9px;
      border: 1px solid var(--border-strong);
      background:
        linear-gradient(var(--ember), var(--ember)) center / 12px 2px no-repeat,
        linear-gradient(var(--ember), var(--ember)) center / 2px 12px no-repeat,
        var(--surface-raised);
      box-shadow: var(--bevel);
      transition: transform 0.3s var(--ease-out);
    }

    details[open] summary::after {
      background:
        linear-gradient(var(--ember), var(--ember)) center / 12px 2px no-repeat,
        var(--surface-raised);
      transform: rotate(180deg);
    }

    details p {
      margin: 0;
      padding: 0 22px 16px;
      color: var(--gray-300);
      font-size: 15px;
    }

    details p:last-child {
      padding-bottom: 22px;
    }

    details a {
      color: var(--white);
      text-decoration-color: var(--ember-line);
      text-underline-offset: 3px;
    }

    code {
      overflow-wrap: anywhere;
      color: var(--ember-text);
    }
  `,
})
export class FaqSection {
  protected readonly links = LINKS;
  private readonly discount = inject(HolderDiscountStore);
  private readonly networks = inject(NetworkStore);
  private readonly launchpad = inject(LaunchpadReader);

  protected readonly discountPercent = computed(() => (this.discount.program()?.bps ?? 0) / 100);
  protected readonly membershipName = computed(
    () => this.networks.config().membership?.name ?? 'membership',
  );
  protected readonly launchpadAddress = this.launchpad.address;
  protected readonly networkLabel = computed(() => this.networks.config().label);
}
