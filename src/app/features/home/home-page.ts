import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LINKS } from '../../core/links';
import { Icon, IconName } from '../../shared/ui/icon/icon';
import { FaqSection } from './faq-section';
import { HomeHero } from './home-hero';
import { FeesSection } from './fees-section';
import { MembershipSection } from './membership-section';
import { RoadmapSection } from './roadmap-section';
import { ShippedSection } from './shipped-section';
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
    ShippedSection,
    RoadmapSection,
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
      text: 'An MRC20 token in one transaction — the contract and the supply are yours.',
      action: 'Create a token',
      path: '/create/token',
    },
    {
      icon: 'collection',
      title: 'Launch an NFT collection',
      text: 'MRC721 with public mint, royalty and IPFS metadata.',
      action: 'Create a collection',
      path: '/create/collection',
    },
    {
      icon: 'market',
      title: 'Trade NFTs',
      text: 'List and buy without custody.',
      action: 'Open the marketplace',
      path: '/marketplace',
    },
    {
      icon: 'presale',
      title: 'Run a presale',
      text: 'Raise MAS; refunds if the soft cap isn’t met.',
      action: 'See presales',
      path: '/presales',
    },
    {
      icon: 'wallet',
      title: 'RustCore Wallet',
      text: 'Send, swap and stake — phone or browser.',
      action: 'Open the wallet',
      href: LINKS.wallet,
    },
    {
      icon: 'cube',
      title: 'Explore projects',
      text: 'Every token and collection, live from the chain.',
      action: 'Browse tokens',
      path: '/tokens',
    },
    {
      icon: 'api',
      title: 'Public API',
      text: 'Free, read-only REST API.',
      action: 'Read the docs',
      path: '/api',
    },
    {
      icon: 'plus',
      title: 'More tools on the way',
      text: 'New tools join this app as they ship.',
      action: 'See the roadmap',
      path: '/',
      fragment: 'roadmap',
    },
  ];

  /** Under the tools: what every one of them holds to. */
  protected readonly principles: readonly { icon: IconName; title: string; text: string }[] = [
    { icon: 'lock', title: 'Self-custodial', text: 'Your keys never leave your device.' },
    { icon: 'code', title: 'Verifiable', text: 'Public source, reproducible builds.' },
    { icon: 'cube', title: 'On-chain truth', text: 'Read straight from the blockchain.' },
    { icon: 'globe', title: 'Served from DeWeb', text: 'No server to take down.' },
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
