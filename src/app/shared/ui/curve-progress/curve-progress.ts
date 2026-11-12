import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { progress } from '../../../core/fairlaunch/curve';
import { Launch, STATE_TRADING } from '../../../core/fairlaunch/records';
import { MasPipe } from '../../pipes/units-pipe';

/** How far a fair launch's curve is from selling out (and moving to Dusa). */
@Component({
  selector: 'app-curve-progress',
  imports: [MasPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bar"
      role="progressbar"
      [attr.aria-valuenow]="percent()"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span class="fill" [style.width.%]="percent()"></span>
    </div>
    <div class="legend">
      @if (launch().state === trading) {
        <span
          ><strong>{{ launch().masIn | mas }}</strong> in the curve</span
        >
        <span class="muted">{{ percent() }}% to Dusa</span>
      } @else {
        <span><strong>Sold out</strong></span>
        <span class="muted">{{ launch().targetMas | mas }} raised</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 8px;
    }

    .bar {
      height: 10px;
      border-radius: 999px;
      background: var(--bg-sunken);
      box-shadow: var(--sunken);
    }

    .fill {
      display: block;
      height: 100%;
      max-width: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--red), var(--ember) 60%, var(--orange));
      box-shadow: 0 0 10px var(--ember-glow);
    }

    .legend {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 14px;
    }
  `,
})
export class CurveProgress {
  readonly launch = input.required<Launch>();
  protected readonly trading = STATE_TRADING;
  protected readonly percent = computed(() => Math.min(100, progress(this.launch())));
}
