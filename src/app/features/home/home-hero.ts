import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LINKS } from '../../core/links';
import { CoreLattice } from './core-lattice';

/**
 * The home page's opening: the promise on the left, the "core block" (the RustCore website's
 * lattice of on-chain blocks, ember orbits around it) on the right. No buttons: the tools and the
 * wallet section right below carry the actions.
 */
@Component({
  selector: 'app-home-hero',
  imports: [CoreLattice],
  templateUrl: './home-hero.html',
  styleUrl: './home-hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeHero {
  protected readonly links = LINKS;

  /** Embers floating around the hero: position in % of the hero, animation delay. */
  protected readonly sparks = [
    { x: 6, y: 18, d: '0s' },
    { x: 38, y: 8, d: '-4.1s' },
    { x: 48, y: 70, d: '-2.4s' },
    { x: 60, y: 12, d: '-1.2s' },
    { x: 92, y: 22, d: '-5.2s' },
    { x: 88, y: 76, d: '-3.3s' },
    { x: 70, y: 88, d: '-0.7s' },
  ];
}
