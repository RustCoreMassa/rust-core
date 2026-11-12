import { Injectable, computed, inject } from '@angular/core';
import { Args, ArrayTypes } from '@massalabs/massa-web3';
import { MassaReader } from '../massa/massa-reader';
import { NetworkStore } from '../network/network-store';
import { FairConfig, Launch, readFairConfig, readLaunch, readLaunchList } from './records';

/** Launches one getLaunches call returns at most (the contract's MAX_PAGE). */
export const LAUNCH_PAGE = 50;

/** Reads of the Fair Launch contract on the network selected in the app. */
@Injectable({ providedIn: 'root' })
export class FairLaunchReader {
  private readonly reader = inject(MassaReader);
  private readonly networks = inject(NetworkStore);

  /** The contract on the selected network; null where it isn't deployed. */
  readonly address = computed(() => this.networks.config().fairLaunchAddress);

  async config(): Promise<FairConfig> {
    return readFairConfig(new Args(await this.read('config')));
  }

  async launch(id: bigint): Promise<Launch> {
    return readLaunch(new Args(await this.read('getLaunch', new Args().addU64(id))));
  }

  /** Every launch, newest first (page by page). */
  async all(): Promise<Launch[]> {
    const out: Launch[] = [];
    let before = 0n;
    for (;;) {
      const page = readLaunchList(
        await this.read('getLaunches', new Args().addU64(before).addU32(BigInt(LAUNCH_PAGE))),
      );
      out.push(...page);
      if (page.length < LAUNCH_PAGE) return out;
      before = page[page.length - 1].id;
      if (before <= 1n) return out;
    }
  }

  /** Ids of the launches `creator` made. */
  async idsBy(creator: string): Promise<bigint[]> {
    const bytes = await this.read('getLaunchesBy', new Args().addString(creator));
    return new Args(bytes).nextArray(ArrayTypes.U64) as bigint[];
  }

  /** The launch id of a token, 0 when it isn't a fair launch. */
  async launchOfToken(token: string): Promise<bigint> {
    return new Args(await this.read('launchOfToken', new Args().addString(token))).nextU64();
  }

  private async read(func: string, parameter = new Args()): Promise<Uint8Array> {
    const target = this.address();
    if (!target) throw new Error('Fair Launch is not deployed on this network yet.');
    const result = await this.reader.provider().readSC({ target, func, parameter });
    if (result.info.error) throw new Error(result.info.error);
    return result.value;
  }
}
