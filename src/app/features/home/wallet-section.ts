import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LINKS } from '../../core/links';
import { WalletPhone } from './wallet-phone';

/**
 * RustCore Wallet on the home page — the RustCore website's wallet section, copied as it was
 * (text, phone illustration and their styles); only the shared label and buttons follow the app.
 */
@Component({
  selector: 'app-wallet-section',
  imports: [WalletPhone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section section-glow" id="wallet">
      <div class="container split">
        <div class="split-text">
          <span class="label">Our first product</span>
          <h2>RustCore Wallet</h2>
          <p>
            A self-custodial wallet for Massa that runs in your phone's browser and installs to your
            home screen like a native app — and now also as a browser extension, on the
            <a [href]="links.walletChrome" target="_blank" rel="noopener noreferrer"
              >Chrome Web Store</a
            >.
          </p>
          <ul class="feature-list">
            <li>
              <strong>Send &amp; receive</strong> MAS and Massa tokens, with a review screen before
              every signature and a QR code for receiving.
            </li>
            <li>
              <strong>Swap</strong> through the Dusa exchange, with a live quote and a minimum
              you'll accept.
            </li>
            <li>
              <strong>Stake</strong>: buy and sell rolls, follow your produced and missed slots, APR
              and estimated daily reward.
            </li>
            <li>
              <strong>History, domains &amp; prices</strong>: every transaction with its details,
              your <code>.massa</code> names (register new ones right in the wallet), token values
              in USD.
            </li>
            <li>
              <strong>Connect to dApps</strong> from the browser extension: a site sees only the
              wallets you choose — one or several, as in MetaMask — and every transaction it asks
              for opens a review window.
            </li>
          </ul>
          <div class="token-strip" aria-label="Supported tokens">
            <img src="assets/tokens/massa-token.png" alt="MAS" title="MAS" />
            <img src="assets/tokens/PUR.png" alt="PUR" title="PUR" />
            <img src="assets/tokens/DUSA.png" alt="DUSA" title="DUSA" />
            <img src="assets/tokens/USDC.png" alt="USDC.e" title="USDC.e" />
            <img src="assets/tokens/WETH.png" alt="WETH" title="WETH.e / WETH.b" />
            <img src="assets/tokens/DAI.png" alt="DAI.e" title="DAI.e" />
            <img src="assets/tokens/BTC.png" alt="WBTC.e" title="WBTC.e" />
            <img src="assets/tokens/USDT.png" alt="USDT.b" title="USDT.b" />
          </div>
          <div class="hero-actions">
            <a class="btn btn-red" [href]="links.wallet" target="_blank" rel="noopener noreferrer"
              >Open the wallet</a
            >
            <a
              class="btn btn-ghost"
              [href]="links.walletChrome"
              target="_blank"
              rel="noopener noreferrer"
              >Add to Chrome</a
            >
            <a
              class="btn btn-ghost"
              [href]="links.walletReleases"
              target="_blank"
              rel="noopener noreferrer"
              >Releases</a
            >
          </div>
        </div>

        <app-wallet-phone />
      </div>
    </section>
  `,
  // The website's styles (rust-core2/styles.css), its token values written out.
  styles: `
    .section-glow {
      position: relative;
    }

    .section-glow::before {
      content: '';
      position: absolute;
      inset: -96px 0 0;
      background: radial-gradient(800px 400px at 50% 0%, rgba(67, 97, 255, 0.07), transparent 70%);
      pointer-events: none;
    }

    .split {
      position: relative;
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      align-items: center;
      gap: 56px;
    }

    h2 {
      margin-top: 16px;
      font-size: clamp(30px, 4.6vw, 46px);
      font-weight: 700;
    }

    .split-text > p {
      margin: 16px 0 0;
      color: #c7c7cd;
      font-size: 17px;
    }

    p a {
      color: var(--white);
      text-decoration-color: rgba(255, 45, 66, 0.6);
      text-underline-offset: 3px;
    }

    p a:hover {
      text-decoration-color: var(--red);
    }

    .feature-list {
      list-style: none;
      margin: 24px 0 0;
      padding: 0;
      display: grid;
      gap: 14px;
    }

    .feature-list li {
      position: relative;
      padding-left: 30px;
      color: #c7c7cd;
    }

    .feature-list li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 5px;
      width: 18px;
      height: 18px;
      border-radius: 6px;
      background:
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ff2d42' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 13l4 4L19 7'/%3E%3C/svg%3E")
          center / 12px no-repeat,
        rgba(255, 45, 66, 0.12);
    }

    .feature-list strong {
      color: var(--white);
    }

    .token-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 28px;
    }

    .token-strip img {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      object-fit: contain;
      background: #111116;
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 3px;
    }

    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 32px;
    }

    @media (max-width: 980px) {
      .split {
        grid-template-columns: 1fr;
        gap: 48px;
      }
    }
  `,
})
export class WalletSection {
  protected readonly links = LINKS;
}
