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
import { Args } from '@massalabs/massa-web3';
import { durationText, launchPhase, PHASE_LABELS } from '../../core/fairlaunch/curve';
import { FairLaunchReader } from '../../core/fairlaunch/fair-launch-reader';
import { FairConfig, Launch, writeFairConfig } from '../../core/fairlaunch/records';
import { Transactions } from '../../core/launchpad/transactions';
import { NetworkStore } from '../../core/network/network-store';
import { toUserMessage } from '../../core/utils/user-error';
import { WalletStore } from '../../core/wallet/wallet-store';
import { MasPipe } from '../../shared/pipes/units-pipe';
import { ExplorerLink } from '../../shared/ui/explorer-link/explorer-link';
import { ADDRESS, ADMIN_COINS } from './admin-forms';
import { FairErrors, FairForm, fairConfigFromForm, fairFormOf } from './fair-launch-forms';

interface FairStatus {
  version: string;
  admin: string;
  pendingAdmin: string;
  fees: bigint;
  config: FairConfig;
  launches: Launch[];
}

/**
 * The Fair Launch contract's admin tools, on /admin: its status and pause, its settings, the fees
 * it collected, hiding a launch (out of the lists, no more buys; sells stay open) and handing the
 * admin role over. Shown to the Fair Launch admin, or to the address offered the role.
 */
@Component({
  selector: 'app-fair-launch-admin',
  imports: [RouterLink, MasPipe, ExplorerLink],
  templateUrl: './fair-launch-admin.html',
  styleUrls: ['./admin-page.scss', './fair-launch-admin.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FairLaunchAdmin {
  protected readonly fair = inject(FairLaunchReader);
  protected readonly network = inject(NetworkStore);
  private readonly wallet = inject(WalletStore);
  private readonly transactions = inject(Transactions);

  /** undefined while read; null when there is no Fair Launch on this network. */
  protected readonly status = signal<FairStatus | null | undefined>(undefined);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<{ section: string; message: string } | null>(null);
  protected readonly done = signal<{ section: string; message: string } | null>(null);

  protected readonly form = signal<FairForm | null>(null);
  protected readonly query = signal('');
  protected readonly newAdmin = signal('');
  protected readonly labels = PHASE_LABELS;

  protected readonly isAdmin = computed(
    () => !!this.status() && this.status()!.admin === this.wallet.address(),
  );
  protected readonly isOffered = computed(
    () => !!this.status()?.pendingAdmin && this.status()!.pendingAdmin === this.wallet.address(),
  );
  protected readonly formResult = computed(() => {
    const s = this.status();
    const f = this.form();
    return s && f ? fairConfigFromForm(s.config, f) : null;
  });
  protected readonly formErrors = computed<FairErrors>(() => {
    const r = this.formResult();
    return r && 'errors' in r ? r.errors : {};
  });
  protected readonly minCurveText = computed(() => {
    const ms = this.status()?.config.minCurveMs ?? 0n;
    return ms ? durationText(Number(ms)) : 'none';
  });
  /** Launches matching the search (name, symbol, token or creator), newest first. */
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.status()?.launches ?? [];
    const found = q
      ? all.filter((l) =>
          [l.name, l.symbol, l.token, l.creator].some((v) => v.toLowerCase().includes(q)),
        )
      : all;
    return found.slice(0, 50);
  });
  protected readonly newAdminError = computed(() => {
    const value = this.newAdmin().trim();
    return value && !ADDRESS.test(value) ? 'Not a Massa address.' : null;
  });

  constructor() {
    effect(() => {
      this.network.network();
      const address = this.fair.address();
      untracked(() => (address ? void this.load() : this.status.set(null)));
    });
  }

  protected phase(l: Launch): string {
    return this.labels[launchPhase(l)];
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected update(key: keyof FairForm, value: string): void {
    const f = this.form();
    if (f) this.form.set({ ...f, [key]: value });
  }

  protected errorIn(section: string): string | null {
    const e = this.error();
    return e?.section === section ? e.message : null;
  }

  protected doneIn(section: string): string | null {
    const d = this.done();
    return d?.section === section ? d.message : null;
  }

  protected async setPaused(paused: boolean): Promise<void> {
    const s = this.status();
    if (!s) return;
    await this.call(
      'status',
      'setConfig',
      writeFairConfig(new Args(), { ...s.config, paused }),
      paused ? 'Paused: no new launches or buys; sells and graduation go on.' : 'Running again.',
    );
  }

  protected async saveConfig(): Promise<void> {
    const r = this.formResult();
    if (!r || !('config' in r)) return;
    await this.call(
      'config',
      'setConfig',
      writeFairConfig(new Args(), r.config),
      'Saved. Launches created from now on use these settings.',
    );
  }

  protected async withdrawFees(): Promise<void> {
    await this.call('fees', 'withdrawFees', new Args(), 'The fees are in the admin wallet.');
  }

  protected async setHidden(l: Launch, hidden: boolean): Promise<void> {
    await this.call(
      'launches',
      'setHidden',
      new Args().addU64(l.id).addBool(hidden),
      hidden
        ? `${l.symbol} is hidden: out of the lists, no more buys; its holders can still sell.`
        : `${l.symbol} is back in the lists and takes buys again.`,
    );
  }

  protected async offerAdmin(): Promise<void> {
    const next = this.newAdmin().trim();
    if (!next || this.newAdminError()) return;
    if (
      await this.call(
        'admin',
        'transferAdmin',
        new Args().addString(next),
        'Offered: the role moves when that wallet accepts it.',
      )
    )
      this.newAdmin.set('');
  }

  protected async acceptAdmin(): Promise<void> {
    await this.call('admin', 'acceptAdmin', new Args(), 'You are the Fair Launch admin now.');
  }

  private async load(): Promise<void> {
    this.loadError.set(null);
    try {
      const [version, admin, pendingAdmin, fees, config, launches] = await Promise.all([
        this.fair.version(),
        this.fair.admin(),
        this.fair.pendingAdmin(),
        this.fair.fees(),
        this.fair.config(),
        this.fair.all(),
      ]);
      this.status.set({ version, admin, pendingAdmin, fees, config, launches });
      this.form.set(fairFormOf(config));
    } catch (err) {
      this.loadError.set(toUserMessage(err));
    }
  }

  /** Sends one admin call, then reads everything again. Resolves true when it went through. */
  private async call(section: string, func: string, args: Args, success: string): Promise<boolean> {
    const target = this.fair.address();
    if (!target || this.busy()) return false;
    this.busy.set(section);
    this.error.set(null);
    this.done.set(null);
    try {
      await this.transactions.send({ target, func, args, coins: ADMIN_COINS });
      this.done.set({ section, message: success });
      await this.load();
      return true;
    } catch (err) {
      this.error.set({ section, message: toUserMessage(err) });
      return false;
    } finally {
      this.busy.set(null);
    }
  }
}
