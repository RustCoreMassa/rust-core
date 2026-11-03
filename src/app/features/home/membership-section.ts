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
import { CollectionReader, MintInfo } from '../../core/launchpad/collection-reader';
import { HolderDiscountStore } from '../../core/launchpad/holder-discount';
import { LaunchpadReader } from '../../core/launchpad/launchpad-reader';
import { feeSavings, mintProgress } from '../../core/launchpad/membership';
import { KIND_COLLECTION, LaunchpadConfig, Project } from '../../core/launchpad/records';
import { NetworkStore } from '../../core/network/network-store';
import { MasPipe } from '../../shared/pipes/units-pipe';
import { ProjectLogo } from '../../shared/ui/project-logo/project-logo';

/** The mint count is re-read this often while the home page is open. */
const REFRESH_MS = 30_000;

/**
 * RustCore's membership collection on the home page: live mint progress, price and what holding
 * one gives. Hidden while the network has no such collection (see membershipCollection).
 */
@Component({
  selector: 'app-membership-section',
  imports: [RouterLink, MasPipe, ProjectLogo],
  templateUrl: './membership-section.html',
  styleUrl: './membership-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MembershipSection {
  private readonly launchpad = inject(LaunchpadReader);
  private readonly collections = inject(CollectionReader);
  private readonly networks = inject(NetworkStore);
  protected readonly discount = inject(HolderDiscountStore);

  /** The collection the Launchpad discounts, else the one announced for this network. */
  protected readonly address = computed(
    () => this.discount.program()?.collection ?? this.networks.config().membership?.address ?? null,
  );
  /** The discount is live on this Launchpad for this collection. */
  protected readonly active = computed(() => {
    const program = this.discount.program();
    return !!program && program.collection === this.address();
  });
  /** The registry record; undefined while it's read. */
  protected readonly project = signal<Project | undefined>(undefined);
  /** The collection's mint settings; undefined while read, null without mint info. */
  protected readonly mint = signal<MintInfo | null | undefined>(undefined);
  /** The Launchpad's fees; undefined while read, null when they can't be read. */
  protected readonly config = signal<LaunchpadConfig | null | undefined>(undefined);
  /** The address isn't a visible collection of this Launchpad: the section goes away. */
  protected readonly rejected = signal(false);

  /** Shown before the chain answers (the record replaces it); null for another collection. */
  private readonly preview = computed(() => {
    const preview = this.networks.config().membership;
    return preview?.address === this.address() ? preview : null;
  });
  protected readonly shown = computed(
    () => !!this.address() && !!this.launchpad.address() && !this.rejected(),
  );
  protected readonly name = computed(() => this.project()?.name ?? this.preview()?.name ?? '');
  protected readonly symbol = computed(
    () => this.project()?.symbol ?? this.preview()?.symbol ?? '',
  );
  protected readonly logoUrl = computed(
    () => this.project()?.info.logoUrl ?? this.preview()?.logoUrl ?? '',
  );
  /** null while unknown (skeleton), '' when the collection has none. */
  protected readonly description = computed(() => {
    const project = this.project();
    return project ? project.info.description : (this.preview()?.description ?? null);
  });

  protected readonly progress = computed(() => {
    const mint = this.mint();
    return mint ? mintProgress(mint) : null;
  });
  protected readonly savings = computed(() => {
    const program = this.discount.program();
    const config = this.config();
    return this.active() && program && config ? feeSavings(config, program.bps) : [];
  });

  protected readonly factLabels = ['Price', 'Left', 'Per wallet'];
  protected readonly savingRows = [1, 2, 3];

  private run = 0;

  constructor() {
    effect(() => {
      const address = this.address();
      this.networks.network();
      untracked(() => void this.load(address));
    });
    // Live progress: the mint count again every 30 s.
    effect((onCleanup) => {
      const address = this.address();
      if (!address) return;
      const timer = setInterval(() => void this.refreshMint(address), REFRESH_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  /** The record, the mint state and the fees are read at once; each part fills in as it comes. */
  private async load(address: string | null): Promise<void> {
    const run = ++this.run;
    this.project.set(undefined);
    this.mint.set(undefined);
    this.config.set(undefined);
    this.rejected.set(false);
    if (!address || !this.launchpad.address()) return;
    const current = () => run === this.run;
    const record = this.launchpad.projectByAddress(address).then(
      (project) => {
        if (!current()) return;
        if (!project || project.kind !== KIND_COLLECTION || project.hidden) this.rejected.set(true);
        else this.project.set(project);
      },
      // Can't be read: the preview stays (or nothing, without one) and the home page goes on.
      () => current() && !this.preview() && this.rejected.set(true),
    );
    const state = this.collections.state(address).then(
      (state) => current() && this.mint.set(state.mint),
      () => current() && this.mint.set(null),
    );
    const config = this.launchpad.config().then(
      (config) => current() && this.config.set(config),
      () => current() && this.config.set(null),
    );
    await Promise.all([record, state, config]);
  }

  private async refreshMint(address: string): Promise<void> {
    const run = this.run;
    const state = await this.collections.state(address).catch(() => null);
    if (state?.mint && run === this.run && address === this.address()) this.mint.set(state.mint);
  }
}
