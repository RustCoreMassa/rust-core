import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PHASE_LABELS, launchPhase, marketCap } from '../../core/fairlaunch/curve';
import { FairLaunchReader } from '../../core/fairlaunch/fair-launch-reader';
import { Launch } from '../../core/fairlaunch/records';
import { formatPrice } from '../../core/dusa/dusa';
import { NetworkStore } from '../../core/network/network-store';
import { toUserMessage } from '../../core/utils/user-error';
import { CurveProgress } from '../../shared/ui/curve-progress/curve-progress';
import { ProjectLogo } from '../../shared/ui/project-logo/project-logo';

type Filter = 'all' | 'trading' | 'graduated';

/** Every fair launch, those still on their curve first. */
@Component({
  selector: 'app-fair-launches-page',
  imports: [RouterLink, ProjectLogo, CurveProgress],
  templateUrl: './fair-launches-page.html',
  styleUrl: './fair-launches-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FairLaunchesPage {
  protected readonly fair = inject(FairLaunchReader);
  protected readonly network = inject(NetworkStore);

  /** null while loading. */
  protected readonly launches = signal<Launch[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal<Filter>('all');
  protected readonly labels = PHASE_LABELS;
  protected readonly phase = launchPhase;

  protected readonly visible = computed(() => {
    const filter = this.filter();
    return (this.launches() ?? [])
      .filter((l) => !l.hidden)
      .filter((l) =>
        filter === 'all' ? true : filter === 'trading' ? l.state !== 2 : l.state === 2,
      )
      .sort((a, b) => (a.state === 2 ? 1 : 0) - (b.state === 2 ? 1 : 0));
  });

  private run = 0;

  constructor() {
    effect(() => {
      this.network.network();
      const address = this.fair.address();
      untracked(() => (address ? void this.load() : this.launches.set([])));
    });
  }

  protected cap(l: Launch): string {
    return formatPrice(marketCap(l));
  }

  private async load(): Promise<void> {
    const run = ++this.run;
    this.launches.set(null);
    this.error.set(null);
    try {
      const all = await this.fair.all();
      if (run === this.run) this.launches.set(all);
    } catch (err) {
      if (run !== this.run) return;
      this.error.set(toUserMessage(err));
      this.launches.set([]);
    }
  }
}
