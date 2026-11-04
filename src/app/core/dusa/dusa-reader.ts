import { Injectable, computed, inject } from '@angular/core';
import { Args } from '@massalabs/massa-web3';
import { MassaReader, READ_FINAL } from '../massa/massa-reader';
import { NetworkStore } from '../network/network-store';
import {
  DusaPairInfo,
  WMAS_DECIMALS,
  poolUrl,
  priceFromId,
  readPairList,
  readPairState,
} from './dusa';

/** A token's MAS pool on Dusa, as the app shows it. */
export interface DusaPool {
  pair: string;
  binStep: number;
  activeId: number;
  /** MAS per whole token at the active bin. */
  price: number;
  /** In the pool now: token smallest units and nanoMAS. */
  tokenReserve: bigint;
  masReserve: bigint;
  /** Dusa's page for it; null when Dusa has no app for this network. */
  url: string | null;
}

const TOKEN_X = new TextEncoder().encode('TOKEN_X');

/** Reads a token's MAS pools on Dusa (Factory V2), on the network selected in the app. */
@Injectable({ providedIn: 'root' })
export class DusaReader {
  private readonly reader = inject(MassaReader);
  private readonly networks = inject(NetworkStore);

  /** Dusa on the selected network; null where it isn't deployed. */
  readonly config = computed(() => this.networks.config().dusa);

  /** The token's TOKEN/WMAS pools (blacklisted ones left out), smallest bin step first. */
  async pools(token: string, decimals: number): Promise<DusaPool[]> {
    const dusa = this.config();
    if (!dusa) return [];
    const list = readPairList(
      await this.read(
        dusa.factory,
        'getAllLBPairs',
        new Args().addString(token).addString(dusa.wmas),
      ),
    ).filter((p) => !p.blacklisted);
    const pools = await Promise.all(list.map((info) => this.pool(info, token, decimals)));
    return pools.sort((a, b) => a.binStep - b.binStep);
  }

  private async pool(info: DusaPairInfo, token: string, decimals: number): Promise<DusaPool> {
    const dusa = this.config()!;
    const [state, [x]] = await Promise.all([
      this.read(info.pair, 'getPairInformation', new Args()).then(readPairState),
      this.reader.provider().readStorage(info.pair, [TOKEN_X], READ_FINAL),
    ]);
    // X is the token for pools created the usual way (WMAS is a quote asset, always Y); a pool
    // the other way round shows the inverse price.
    const tokenIsX = !x || new TextDecoder().decode(x) === token;
    const price = tokenIsX
      ? priceFromId(state.activeId, info.binStep, decimals, WMAS_DECIMALS)
      : 1 / priceFromId(state.activeId, info.binStep, WMAS_DECIMALS, decimals);
    const [tokenX, tokenY] = tokenIsX ? [token, dusa.wmas] : [dusa.wmas, token];
    return {
      pair: info.pair,
      binStep: info.binStep,
      activeId: state.activeId,
      price,
      tokenReserve: tokenIsX ? state.reserveX : state.reserveY,
      masReserve: tokenIsX ? state.reserveY : state.reserveX,
      url: dusa.appUrl ? poolUrl(dusa.appUrl, tokenX, tokenY, info.binStep) : null,
    };
  }

  private async read(target: string, func: string, parameter: Args): Promise<Uint8Array> {
    const result = await this.reader.provider().readSC({ target, func, parameter });
    if (result.info.error) throw new Error(result.info.error);
    return result.value;
  }
}
