import { InjectionToken } from '@angular/core';
import type { Wallet } from '@massalabs/wallet-provider';
import { LINKS } from '../links';

/** wallet-provider's WalletName values. */
export type WalletId = 'RUSTCORE' | 'BEARBY' | 'MASSA WALLET' | 'METAMASK';

export interface WalletOption {
  readonly id: WalletId;
  readonly label: string;
  readonly installUrl: string;
}

/**
 * RustCore Wallet's extension in this browser's store: Firefox Add-ons in Firefox (desktop and
 * Android), the Chrome Web Store anywhere else. Sites connect to the extension, not to the web
 * wallet.
 */
export function rustCoreInstallUrl(userAgent = globalThis.navigator?.userAgent ?? ''): string {
  return /\bFirefox\//.test(userAgent) ? LINKS.walletFirefox : LINKS.walletChrome;
}

/** The wallets @massalabs/wallet-provider can talk to. */
export const WALLET_OPTIONS: readonly WalletOption[] = [
  { id: 'RUSTCORE', label: 'RustCore Wallet', installUrl: rustCoreInstallUrl() },
  { id: 'BEARBY', label: 'Bearby', installUrl: 'https://bearby.io' },
  { id: 'MASSA WALLET', label: 'Massa Station', installUrl: 'https://station.massa.net/' },
  {
    id: 'METAMASK',
    label: 'MetaMask (Massa Snap)',
    installUrl: 'https://snaps.metamask.io/snap/npm/massalabs/metamask-snap/',
  },
];

/**
 * Finds the wallets installed in this browser. wallet-provider (and the MetaMask libraries it
 * pulls in) is loaded only here, on first use, so it stays out of the initial bundle.
 */
export const WALLET_DISCOVERY = new InjectionToken<() => Promise<Wallet[]>>('WALLET_DISCOVERY', {
  providedIn: 'root',
  factory: () => async () => (await import('@massalabs/wallet-provider')).getWallets(),
});
