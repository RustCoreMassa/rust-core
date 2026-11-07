import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The "core block" of the RustCore website's hero: a 3×3 lattice of on-chain blocks tilted in 3D,
 * RustCore lit at its heart, Massa tokens around it, data flowing along dashed links — with
 * ember orbits turning around it. Decorative.
 */
@Component({
  selector: 'app-core-lattice',
  host: { 'aria-hidden': 'true' },
  templateUrl: './core-lattice.html',
  styleUrl: './core-lattice.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoreLattice {}
