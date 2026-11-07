/**
 * Static content of the home page: what shipped and what's next. It follows the products'
 * CHANGELOGs (this repo's and RustCore Wallet's) — update it when a product ships.
 */

export type Product = 'Wallet' | 'Launchpad' | 'RustCore';

export interface Milestone {
  readonly date: string;
  readonly product: Product;
  readonly title: string;
  readonly text: string;
}

/** Newest first. */
export const MILESTONES: readonly Milestone[] = [
  {
    date: 'Nov 2026',
    product: 'Wallet',
    title: 'RustCore Wallet 1.7 — NFT gallery, safer by default',
    text:
      'The NFTs page shows what your wallet holds, from collections verified on the Launchpad only, ' +
      'so spam NFTs never appear. The wallet locks after 15 minutes without use, asks for your PIN ' +
      'before copying a private key, slows down repeated wrong PINs and refuses message signatures ' +
      'that could move funds.',
  },
  {
    date: 'Nov 2026',
    product: 'Launchpad',
    title: 'Launchpad 1.5 – 1.8 — public API, Dusa, whitelists and vesting',
    text:
      'Very large collections load through the public RustCore API. Token owners can open a Dusa ' +
      'pool and add liquidity from the token page. Presale whitelists, vesting and a safer close ' +
      'come with Launchpad contract v1.8.0, released and headed for mainnet after its 72-hour ' +
      'public delay.',
  },
  {
    date: 'Oct 2026',
    product: 'Wallet',
    title: 'RustCore Wallet on the Chrome Web Store',
    text:
      'The browser extension is public on the Chrome Web Store: install it in one click on Chrome, ' +
      'Brave, Opera, Vivaldi or Arc, and it keeps itself up to date. Edge and Firefox follow.',
  },
  {
    date: 'Oct 2026',
    product: 'Launchpad',
    title: 'Core Keepers and Launchpad 1.4',
    text:
      'Our NFT collection is live: 1,000 Core Keepers, minted on the Launchpad. Holding one takes a ' +
      'discount off every Launchpad fee — set in the Launchpad contract, upgraded on mainnet to ' +
      'v1.4.0 after its 72-hour public delay.',
  },
  {
    date: 'Oct 2026',
    product: 'Wallet',
    title: 'RustCore Wallet 1.6 — several wallets per site',
    text:
      'Connect several of your wallets to a site, as in MetaMask: the site follows the wallet you ' +
      'switch to, and Settings lists the wallets each site sees. The lock screen gets “Forgot your ' +
      'PIN / password?”.',
  },
  {
    date: 'Oct 2026',
    product: 'Wallet',
    title: 'RustCore Wallet 1.5 — ready for Massa’s next release',
    text:
      'Ready for Massa’s MAIN.5.1 node release, so a transaction that went through is never ' +
      'reported as timed out. dApps can set the fee of transfers and rolls, and connected sites ' +
      'always hear about account and network changes.',
  },
  {
    date: 'Oct 2026',
    product: 'Launchpad',
    title: 'Launchpad 1.3 — tokenomics and audit fixes',
    text:
      'Token owners can show how the supply is split, as a chart with the live balance of each ' +
      'address. Fixes from our internal audit: a safer collection template, a royalty fixed when ' +
      'an NFT is listed, a cap on presale rates and warnings on imported projects and look-alike ' +
      'symbols.',
  },
  {
    date: 'Oct 2026',
    product: 'Wallet',
    title: 'RustCore Wallet 1.4 — register .massa names',
    text:
      'Register a .massa name from the NFTs page: the wallet shows its price, checks on-chain that ' +
      'it’s free and tries the registration first, so you only confirm one that will go through.',
  },
  {
    date: 'Oct 2026',
    product: 'Wallet',
    title: 'RustCore Wallet 1.3 — custom tokens',
    text:
      'Add any MRC-20 token by its contract address: the wallet reads its name, symbol and ' +
      'decimals from the chain for you to review, then shows its balance and lets you send it.',
  },
  {
    date: 'Oct 2026',
    product: 'RustCore',
    title: 'On Massa’s official gateway',
    text:
      'The wallet, the Launchpad and our site are served by Massa’s own DeWeb gateway, at ' +
      'wrustcore.massa.network, lrustcore.massa.network and rustcore.massa.network.',
  },
  {
    date: 'Oct 2026',
    product: 'Wallet',
    title: 'RustCore Wallet 1.2 — connect to dApps',
    text:
      'The browser extension connects to Massa dApps: each site sees only the wallet you choose, ' +
      'and every transfer, contract call or signature it asks for opens a review window.',
  },
  {
    date: 'Oct 2026',
    product: 'Launchpad',
    title: 'RustCore Launchpad 1.0',
    text:
      'Live on Massa mainnet and served from DeWeb: launch tokens and NFT collections, trade NFTs ' +
      'and run token presales, with no backend.',
  },
  {
    date: 'Oct 2026',
    product: 'Wallet',
    title: 'RustCore Wallet 1.1 — browser extension',
    text:
      'The same wallet as an extension for Chrome, Edge, Brave and Firefox: as a popup, in the side ' +
      'panel or full screen. Version 1.1.1 then halved its size, so it loads faster on phones.',
  },
  {
    date: 'Sep 2026',
    product: 'RustCore',
    title: 'Live on DeWeb, with releases you can verify',
    text:
      'The wallet is served from the Massa blockchain itself and installs to the home screen. ' +
      'Every version is built in public from its tagged source, with checksums; the build is ' +
      'reproducible byte for byte.',
  },
  {
    date: 'Sep 2026',
    product: 'Wallet',
    title: 'RustCore Wallet 1.0',
    text:
      'First production release on Massa mainnet: encrypted multi-wallet vault, send and receive, ' +
      'swaps through Dusa, staking, history and .massa domains.',
  },
];

export type RoadmapStatus = 'Live' | 'In progress' | 'Planned' | 'Exploring';

export interface RoadmapTrack {
  readonly tag: string;
  readonly title: string;
  readonly status: RoadmapStatus;
  readonly items: readonly { readonly text: string; readonly done: boolean }[];
}

const done = (text: string) => ({ text, done: true });
const next = (text: string) => ({ text, done: false });

export const ROADMAP: readonly RoadmapTrack[] = [
  {
    tag: 'Launchpad · 1.x',
    title: 'Launchpad',
    status: 'Live',
    items: [
      done('Token & collection launches, imports'),
      done('NFT marketplace & token presales'),
      done('Live on mainnet and DeWeb'),
      done('Tokenomics on token pages'),
      done('Internal audit fixes (contract v1.3.1)'),
      done('Core Keepers holder discount (contract v1.4.0)'),
      done('Public API for very large collections'),
      done('Liquidity on Dusa from the token page'),
    ],
  },
  {
    tag: 'Launchpad · Next',
    title: 'Launchpad extras',
    status: 'In progress',
    items: [
      done('Presale whitelist & vesting (contract v1.8.0)'),
      next('Contract v1.8.0 on mainnet'),
      next('Token payments on the marketplace'),
      next('Connection with RustCore Wallet'),
      next('Independent security audit'),
    ],
  },
  {
    tag: 'Wallet · Phase 1',
    title: 'Web wallet',
    status: 'Live',
    items: [
      done('Encrypted multi-wallet vault'),
      done('Send, receive, swap, stake'),
      done('History & .massa domains'),
      done('Custom tokens and .massa registration'),
      done('On Massa’s official DeWeb gateway'),
      done('NFT gallery'),
      next('Independent security audit'),
      next('Translations'),
    ],
  },
  {
    tag: 'Wallet · Phase 2',
    title: 'Browser extension',
    status: 'In progress',
    items: [
      done('Chromium & Firefox builds'),
      done('Connect to Massa dApps with a review screen'),
      done('Per-site permissions, several wallets per dApp'),
      done('In Massa’s wallet library'),
      done('Live on the Chrome Web Store'),
      next('Edge & Firefox Add-ons'),
    ],
  },
  {
    tag: 'Wallet · Phase 3',
    title: 'Mobile apps',
    status: 'In progress',
    items: [
      next('iOS and Android apps'),
      next('Biometric unlock'),
      next('Notifications for incoming transfers'),
    ],
  },
  {
    tag: 'Later',
    title: 'Beyond',
    status: 'Exploring',
    items: [
      next('More tools for the Massa ecosystem, in this app'),
      next('Hardware-wallet support'),
    ],
  },
];
