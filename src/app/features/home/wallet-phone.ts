import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The wallet's home screen as the RustCore website drew it (an illustration, not live data). */
@Component({
  selector: 'app-wallet-phone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <!-- Illustration of the wallet's home screen (not live data). -->
    <div class="phone" aria-hidden="true">
      <div class="phone-screen">
        <div class="phone-glow"></div>
        <div class="ph-top">
          <div class="ph-avatar">WA</div>
          <div>
            <div class="ph-name">wallet_1</div>
            <div class="ph-net">● MAINNET</div>
          </div>
        </div>
        <div class="ph-label">MAS BALANCE</div>
        <div class="ph-balance">1,250.00 <span>MAS</span></div>
        <div class="ph-actions">
          <div>
            <i
              ><svg viewBox="0 0 24 24"><path d="M12 4v14M6 12l6 6 6-6" /></svg></i
            >Receive
          </div>
          <div class="primary">
            <i
              ><svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" /></svg></i
            >Send
          </div>
          <div>
            <i
              ><svg viewBox="0 0 24 24"><path d="M6 8h11l-3-3M18 16H7l3 3" /></svg></i
            >Swap
          </div>
        </div>
        <div class="ph-tabs"><span class="on">Tokens</span><span>History</span></div>
        <div class="ph-row">
          <img src="assets/tokens/massa-token.png" alt="" />
          <div><b>Massa</b><small>MAS</small></div>
          <div class="r"><b>1,250.00</b><small>MAS</small></div>
        </div>
        <div class="ph-row">
          <img src="assets/tokens/USDC.png" alt="" />
          <div><b>USD Coin</b><small>USDC.e</small></div>
          <div class="r"><b>42.50</b><small>USDC.e</small></div>
        </div>
        <div class="ph-row">
          <img src="assets/tokens/DUSA.png" alt="" />
          <div><b>Dusa</b><small>DUSA</small></div>
          <div class="r"><b>310.00</b><small>DUSA</small></div>
        </div>
        <div class="ph-row">
          <img src="assets/tokens/PUR.png" alt="" />
          <div><b>Pur</b><small>PUR</small></div>
          <div class="r"><b>9,000.00</b><small>PUR</small></div>
        </div>
        <div class="ph-nav">
          <div class="on">
            <svg viewBox="0 0 24 24">
              <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />
            </svg>
            Home
          </div>
          <div>
            <svg viewBox="0 0 24 24">
              <rect x="4" y="4" width="7" height="7" rx="1.5" />
              <rect x="13" y="4" width="7" height="7" rx="1.5" />
              <rect x="4" y="13" width="7" height="7" rx="1.5" />
              <rect x="13" y="13" width="7" height="7" rx="1.5" />
            </svg>
            NFTs
          </div>
          <div>
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3.2" />
              <circle cx="12" cy="12" r="8.2" opacity="0.55" />
            </svg>
            Staking
          </div>
          <div>
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.5-2-3.4-2.3.7a7.6 7.6 0 0 0-2.6-1.5l-.4-2.3h-4l-.4 2.3a7.6 7.6 0 0 0-2.6 1.5l-2.3-.7-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3L2.7 15l2 3.4 2.3-.7a7.6 7.6 0 0 0 2.6 1.5l.4 2.3h4l.4-2.3a7.6 7.6 0 0 0 2.6-1.5l2.3.7 2-3.4z"
              />
            </svg>
            Settings
          </div>
        </div>
      </div>
    </div>
  `,
  // The website's styles (rust-core2/styles.css), its token values written out.
  styles: `
    :host {
      justify-self: center;
    }

    /* Phone mockup — an illustration of the wallet's home screen. */
    .phone {
      justify-self: center;
      width: 300px;
      padding: 10px;
      border-radius: 46px;
      background: linear-gradient(160deg, #2a2a33, #0c0c10 60%);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow:
        0 40px 80px -30px rgba(0, 0, 0, 0.9),
        0 0 90px -20px rgba(255, 45, 66, 0.35);
      transform: rotate(-2deg);
    }

    .phone-screen {
      position: relative;
      overflow: hidden;
      border-radius: 37px;
      padding: 26px 16px 12px;
      background: #07070a;
      min-height: 560px;
    }

    .phone-glow {
      position: absolute;
      top: -120px;
      left: 50%;
      width: 360px;
      height: 300px;
      transform: translateX(-50%);
      background:
        radial-gradient(ellipse at 50% 40%, rgba(255, 45, 66, 0.35) 0%, transparent 55%),
        radial-gradient(ellipse at 30% 60%, rgba(67, 97, 255, 0.28) 0%, transparent 60%);
      filter: blur(8px);
    }

    .phone-screen > *:not(.phone-glow) {
      position: relative;
    }

    .ph-top {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .ph-avatar {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 11px;
      background: linear-gradient(155deg, #ff4a5c, #b3122a);
      font: 700 12px/1 var(--font-body);
    }

    .ph-name {
      font-size: 13px;
      font-weight: 600;
    }

    .ph-net {
      display: inline-block;
      margin-top: 3px;
      padding: 1px 7px;
      border-radius: 999px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--green);
      background: rgba(51, 209, 122, 0.12);
      border: 1px solid rgba(51, 209, 122, 0.3);
    }

    .ph-label {
      margin-top: 22px;
      color: #8a8a91;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
    }

    .ph-balance {
      margin-top: 4px;
      font: 700 34px/1.1 var(--font-display);
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }

    .ph-balance span {
      font-size: 15px;
      color: #8a8a91;
    }

    .ph-actions {
      display: flex;
      justify-content: space-around;
      margin: 22px 0 18px;
      font-size: 10px;
      color: #c7c7cd;
      text-align: center;
    }

    .ph-actions i {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      margin: 0 auto 6px;
      border-radius: 13px;
      background: #1b1b22;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .ph-actions svg {
      width: 17px;
      height: 17px;
      fill: none;
      stroke: var(--white);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .ph-actions .primary i {
      background: linear-gradient(180deg, #ff4a5c, #e8192f);
      border-color: transparent;
      box-shadow: 0 10px 24px -10px rgba(255, 45, 66, 0.7);
    }

    .ph-tabs {
      display: flex;
      gap: 4px;
      padding: 3px;
      margin-bottom: 8px;
      border-radius: 12px;
      background: #111116;
      border: 1px solid rgba(255, 255, 255, 0.07);
      font-size: 11px;
      color: #8a8a91;
    }

    .ph-tabs span {
      padding: 6px 12px;
      border-radius: 9px;
    }

    .ph-tabs .on {
      background: #1b1b22;
      color: var(--white);
    }

    .ph-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 4px;
      font-size: 12px;
    }

    .ph-row img {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      object-fit: contain;
    }

    .ph-row b {
      display: block;
      font-weight: 600;
    }

    .ph-row small {
      color: #8a8a91;
      font-size: 10px;
    }

    .ph-row .r {
      margin-left: auto;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    /* The wallet's bottom navigation, same icons. */
    .ph-nav {
      display: flex;
      justify-content: space-around;
      margin: 12px -8px 0;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
    }

    .ph-nav > div {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      min-width: 50px;
      padding: 5px 6px;
      border-radius: 11px;
      color: #8a8a91;
      font-size: 9px;
    }

    .ph-nav svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
    }

    .ph-nav .on {
      color: var(--white);
      background: rgba(255, 45, 66, 0.1);
    }

    .ph-nav .on svg {
      stroke: var(--red);
      filter: drop-shadow(0 0 5px rgba(255, 45, 66, 0.55));
    }

    @media (max-width: 980px) {
      .phone {
        transform: none;
      }
    }
  `,
})
export class WalletPhone {}
