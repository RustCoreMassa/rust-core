import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LINKS } from '../../core/links';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="site-footer">
      <div class="glow-line" aria-hidden="true"></div>
      <div class="container footer-inner">
        <div class="footer-brand">
          <a class="brand" routerLink="/">
            <img class="brand-logo" src="assets/logo.svg" alt="" width="44" height="44" />
            <span class="wordmark">Rust<span class="grad">Core</span></span>
          </a>
          <p>
            Self-custodial, verifiable tools for the Massa blockchain — served from the chain, with
            no backend.
          </p>
          <div class="socials">
            <a class="icon-btn" [href]="links.x" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77zm-1.08 16.18h1.7L7.4 4.73H5.58z"
                />
              </svg>
              <span class="visually-hidden">RustCore on X</span>
            </a>
            <a class="icon-btn" [href]="links.telegram" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M21.5 4.2 18.4 19c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.2 12.9l-4.7-1.5c-1-.3-1-1 .2-1.5L20.2 2.8c.9-.3 1.6.2 1.3 1.4z"
                />
              </svg>
              <span class="visually-hidden">RustCore on Telegram</span>
            </a>
            <a class="icon-btn" [href]="links.github" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"
                />
              </svg>
              <span class="visually-hidden">RustCore on GitHub</span>
            </a>
          </div>
        </div>
        <div class="footer-cols">
          <div>
            <h4>Launchpad</h4>
            <a routerLink="/tokens">Tokens</a>
            <a routerLink="/collections">Collections</a>
            <a routerLink="/marketplace">Marketplace</a>
            <a routerLink="/presales">Presales</a>
            <a routerLink="/api">Public API</a>
          </div>
          <div>
            <h4>RustCore</h4>
            <a [href]="links.wallet" target="_blank" rel="noopener noreferrer">RustCore Wallet</a>
            <a [href]="links.walletChrome" target="_blank" rel="noopener noreferrer"
              >Wallet for Chrome</a
            >
            <a routerLink="/" fragment="roadmap">Roadmap</a>
            <a routerLink="/" fragment="faq">FAQ</a>
            <a [href]="links.appReleases" target="_blank" rel="noopener noreferrer">Releases</a>
            <a [href]="links.security" target="_blank" rel="noopener noreferrer"
              >Report a vulnerability</a
            >
          </div>
          <div>
            <h4>Massa</h4>
            <a [href]="links.massa" target="_blank" rel="noopener noreferrer">massa.net</a>
            <a [href]="links.deweb" target="_blank" rel="noopener noreferrer">DeWeb</a>
            <a [href]="links.explorer" target="_blank" rel="noopener noreferrer">Explorer</a>
          </div>
        </div>
      </div>
      <div class="container footer-bottom">
        <span>© 2026 RustCore</span>
        <span>Not affiliated with Massa Labs or Dusa.</span>
      </div>
    </footer>
  `,
  styles: `
    .site-footer {
      position: relative;
      margin-top: 24px;
      padding: 64px 0 32px;
      background: linear-gradient(180deg, rgba(14, 14, 17, 0.4), rgba(8, 8, 10, 0.9));
      border-top: 1px solid var(--border);
    }

    /* An ember seam along the top edge. */
    .glow-line {
      position: absolute;
      top: -1px;
      left: 50%;
      width: min(720px, 80%);
      height: 1px;
      transform: translateX(-50%);
      background: linear-gradient(90deg, transparent, var(--ember), transparent);
      box-shadow: 0 0 18px 2px rgba(255, 90, 54, 0.45);
    }

    .footer-inner {
      display: grid;
      grid-template-columns: 1fr 1.4fr;
      gap: 40px;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
    }

    .brand-logo {
      width: 44px;
      height: 44px;
    }

    .wordmark {
      font: 700 20px/1 var(--font-display);
      letter-spacing: -0.02em;
    }

    .footer-brand p {
      margin: 16px 0 0;
      max-width: 320px;
      color: var(--gray-500);
      font-size: 14px;
    }

    .socials {
      display: flex;
      gap: 8px;
      margin-top: 20px;
    }

    .socials .icon-btn {
      display: grid;
      place-items: center;
      color: var(--gray-300);
      transition:
        color 0.2s ease,
        border-color 0.2s ease;
    }

    .socials .icon-btn:hover {
      color: var(--ember);
    }

    .socials svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }

    .footer-cols {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }

    h4 {
      margin-bottom: 12px;
      color: var(--white);
      font-size: 13px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .footer-cols a {
      display: block;
      padding: 4px 0;
      color: var(--gray-500);
      font-size: 14px;
      text-decoration: none;
      transition: color 0.2s ease;
    }

    .footer-cols a:hover {
      color: var(--white);
    }

    .footer-bottom {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
      margin-top: 44px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      color: var(--gray-700);
      font-size: 13px;
    }

    @media (max-width: 900px) {
      .footer-inner {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 560px) {
      .footer-cols {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class SiteFooter {
  protected readonly links = LINKS;
}
