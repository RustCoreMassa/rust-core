import { Injectable, inject } from '@angular/core';
import { IndexerApi } from '../indexer/indexer-api';
import { CollectionReader } from './collection-reader';
import { ItemsSource } from './collection-items';
import { LaunchpadReader } from './launchpad-reader';
import { Listing } from './records';

/** The marketplace's listings and where they came from. */
export interface ListingsForSale {
  readonly listings: Listing[];
  readonly source: ItemsSource;
}

/**
 * Every listing that can be bought, for the marketplace page: from the RustCore API when it is
 * up (one paged request, whatever the number of listings), from the chain otherwise or whenever
 * the API fails. Read from the chain, each page of listings reads every listing key and each
 * listing is checked against its collection: many listings would make the page slow.
 */
@Injectable({ providedIn: 'root' })
export class MarketListings {
  private readonly api = inject(IndexerApi);
  private readonly collections = inject(CollectionReader);
  private readonly launchpad = inject(LaunchpadReader);

  /**
   * `launchpad`: the Launchpad's address on the selected network. `chainOnly` skips the API
   * (the user asked for a fresh read). With the API, the approval isn't checked (it isn't
   * indexed): the market panel checks the listing on chain before a purchase.
   */
  async forSale(launchpad: string, chainOnly = false): Promise<ListingsForSale> {
    if (!chainOnly) {
      const status = await this.api.ready();
      if (status) {
        try {
          const listings = await this.api.validListings();
          return { listings, source: { kind: 'api', syncedAt: status.syncedAt } };
        } catch (err) {
          this.api.forget();
          console.warn('[api] marketplace listings, reading the chain:', err);
        }
      }
    }
    const all = await this.launchpad.allListings(0n);
    const valid = await this.collections.validListings(all, launchpad);
    return { listings: all.filter((l) => valid.has(l.id)), source: { kind: 'chain' } };
  }
}
