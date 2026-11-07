import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LINKS } from '../../core/links';
import { Icon, IconName } from '../../shared/ui/icon/icon';
import { FaqSection } from './faq-section';
import { HomeHero } from './home-hero';
import { FeesSection } from './fees-section';
import { MembershipSection } from './membership-section';
import { StorySection } from './story-section';
import { SupportSection } from './support-section';
import { WalletSection } from './wallet-section';

interface Tool {
  readonly icon: IconName;
  readonly title: string;
  readonly text: string;
  readonly action: string;
  /** An in-app page… */
  readonly path?: string;
  readonly fragment?: string;
  /** …or another RustCore product, in a new tab. */
  readonly href?: string;
}

/**
 * RustCore's home: who we are, every tool of the app, RustCore Wallet, the membership NFT, fees,
 * what shipped, the roadmap, the FAQ and how to support the project.
 */
@Component({
  selector: 'app-home-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    Icon,
    HomeHero,
    WalletSection,
    MembershipSection,
    FeesSection,
    StorySection,
    FaqSection,
    SupportSection,
  ],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected readonly links = LINKS;

  protected readonly tools: readonly Tool[] = [
    {
      icon: 'token',
      title: 'Launch a token',
      text: 'An MRC20 token in one transaction, with its tokenomics. You own the contract and the whole supply.',
      action: 'Create a token',
      path: '/create/token',
    },
    {
      icon: 'collection',
      title: 'Launch an NFT collection',
      text: 'An MRC721 collection with owner or public mint, a royalty and IPFS metadata.',
      action: 'Create a collection',
      path: '/create/collection',
    },
    {
      icon: 'market',
      title: 'Trade NFTs',
      text: 'List and buy without custody: the NFT stays in your wallet until it sells.',
      action: 'Open the marketplace',
      path: '/marketplace',
    },
    {
      icon: 'presale',
      title: 'Run a presale',
      text: 'Raise MAS for your token. Contributors claim on success or take their MAS back.',
      action: 'See presales',
      path: '/presales',
    },
    {
      icon: 'wallet',
      title: 'RustCore Wallet',
      text: 'Send, swap, stake and sign — on your phone or as a browser extension.',
      action: 'Open the wallet',
      href: LINKS.wallet,
    },
    {
      icon: 'cube',
      title: 'Explore projects',
      text: 'Every token and collection launched or imported, with live supply and holders.',
      action: 'Browse tokens',
      path: '/tokens',
    },
    {
      icon: 'api',
      title: 'Public API',
      text: 'Read every project, NFT holder and listing from a free, read-only REST API.',
      action: 'Read the docs',
      path: '/api',
    },
    {
      icon: 'plus',
      title: 'More tools on the way',
      text: 'New tools join this app as they ship — no new site to find, no new address to trust.',
      action: 'See the roadmap',
      path: '/',
      fragment: 'roadmap',
    },
  ];

  protected readonly principles: readonly { icon: IconName; title: string; text: string }[] = [
    {
      icon: 'lock',
      title: 'Self-custodial',
      text: 'Your keys stay on your device, encrypted with your PIN or password, and are never sent anywhere. There is no RustCore server.',
    },
    {
      icon: 'code',
      title: 'Verifiable',
      text: 'The full source is public and every release is built in public CI, with checksums you can compare against your own build.',
    },
    {
      icon: 'cube',
      title: 'On-chain truth',
      text: 'Balances, projects and listings come straight from the blockchain. Nothing is shown as done before the network executed it.',
    },
    {
      icon: 'globe',
      title: 'Served from the chain',
      text: 'Hosted on DeWeb, Massa’s decentralized web: the files live on-chain, with no web server to take down or tamper with.',
    },
  ];

  protected readonly steps: readonly { icon: IconName; title: string; text: string }[] = [
    {
      icon: 'form',
      title: 'Fill in the details',
      text: 'Name, symbol, supply, links — and whether the code may change later.',
    },
    {
      icon: 'sign',
      title: 'Sign once',
      text: 'Your wallet signs one transaction; the Launchpad contract deploys it from verified templates.',
    },
    {
      icon: 'crown',
      title: 'Own it',
      text: 'You are the owner from the first block. Download the original code anytime.',
    },
  ];
}
