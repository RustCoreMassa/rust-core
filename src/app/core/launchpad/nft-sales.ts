import { Injectable, inject } from '@angular/core';
import { IndexerApi } from '../indexer/indexer-api';
import { LaunchpadReader, PAGE_SIZE } from './launchpad-reader';
import { Project, Sale } from './records';

/** Sales of a collection read from the chain, at most, when the API can't give an NFT's older sales. */
export const MAX_CHAIN_SALES = 1_000;

/**
 * The sales of one NFT, newest first. The contract keeps sales per collection: its newest page
 * comes from the chain (always current, a sale just made included); older sales, when the
 * collection has more, from the RustCore API (filtered by NFT), else from the chain page after
 * page, up to MAX_CHAIN_SALES.
 */
@Injectable({ providedIn: 'root' })
export class NftSales {
  private readonly api = inject(IndexerApi);
  private readonly launchpad = inject(LaunchpadReader);

  async history(project: Project, tokenId: bigint): Promise<Sale[]> {
    const newest = await this.launchpad.sales(project.id);
    const sales = newest.items.filter((s) => s.tokenId === tokenId);
    if (newest.total <= newest.items.length) return sales;
    const older = await this.older(project, tokenId, newest.items.length, newest.total);
    return byIdNewestFirst([...sales, ...older]);
  }

  private async older(
    project: Project,
    tokenId: bigint,
    from: number,
    total: number,
  ): Promise<Sale[]> {
    if (await this.api.ready()) {
      try {
        return await this.api.nftSales(project.address, tokenId);
      } catch (err) {
        this.api.forget();
        console.warn('[api] NFT sales, reading the chain:', err);
      }
    }
    const sales: Sale[] = [];
    for (let offset = from; offset < Math.min(total, MAX_CHAIN_SALES); offset += PAGE_SIZE) {
      const page = await this.launchpad.sales(project.id, offset);
      sales.push(...page.items.filter((s) => s.tokenId === tokenId));
      if (!page.items.length) break;
    }
    return sales;
  }
}

/** Each sale once (pages read at different moments may overlap), newest first. */
function byIdNewestFirst(sales: Sale[]): Sale[] {
  const byId = new Map(sales.map((s) => [s.id, s]));
  return [...byId.values()].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}
