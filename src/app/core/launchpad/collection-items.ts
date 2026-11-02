import { Injectable, inject } from '@angular/core';
import { IndexerApi } from '../indexer/indexer-api';
import { CollectionReader, NftItem } from './collection-reader';
import { LaunchpadReader } from './launchpad-reader';
import { Project } from './records';

/**
 * From this many NFTs on, a collection's holders and prices come from the RustCore API when it
 * is up: below it the chain is fast enough (~2.5 s per 1,000 NFTs) and always current.
 */
export const LARGE_COLLECTION = 500;

/** Where a collection's NFT list came from. */
export type ItemsSource =
  { readonly kind: 'chain' } | { readonly kind: 'api'; readonly syncedAt: Date | null };

/**
 * A collection's NFTs with their holders, and the prices of its valid listings: from the
 * RustCore API for large collections, from the chain otherwise or whenever the API fails.
 */
@Injectable({ providedIn: 'root' })
export class CollectionItems {
  private readonly api = inject(IndexerApi);
  private readonly collections = inject(CollectionReader);
  private readonly launchpad = inject(LaunchpadReader);

  /**
   * Loads the NFTs, handing each partial list to `onItems` (`done` on the last call).
   * `knownSize`: the collection's supply when the caller knows it (RC-Collection's mintInfo).
   * `chainOnly` skips the API (the user asked for a fresh read).
   */
  async items(
    address: string,
    knownSize: bigint | null,
    onItems: (items: NftItem[], done: boolean) => void,
    chainOnly = false,
  ): Promise<ItemsSource> {
    const small = knownSize !== null && knownSize < BigInt(LARGE_COLLECTION);
    if (!chainOnly && !small) {
      const status = await this.api.ready();
      if (status) {
        try {
          const size = knownSize ?? BigInt((await this.api.collectionStats(address))?.nfts ?? -1);
          if (size >= BigInt(LARGE_COLLECTION)) {
            const indexed = await this.api.collectionItems(address, (partial) =>
              onItems(partial.map(toItem), false),
            );
            // A collection the indexer hasn't read yet (launched a moment ago): the chain knows.
            if (indexed.length || knownSize === 0n) {
              onItems(indexed.map(toItem), true);
              return { kind: 'api', syncedAt: status.syncedAt };
            }
          }
        } catch (err) {
          this.api.forget();
          console.warn('[api] collection items, reading the chain:', err);
        }
      }
    }
    onItems(await this.collections.items(address), true);
    return { kind: 'chain' };
  }

  /**
   * Prices of the listings that can be bought, by token id. With the API, the approval isn't
   * checked (it isn't indexed): the market panel checks it on chain before a purchase.
   */
  async prices(project: Project, source: ItemsSource): Promise<Map<bigint, bigint>> {
    if (source.kind === 'api') {
      try {
        return await this.api.validListingPrices(project.address);
      } catch (err) {
        console.warn('[api] listings, reading the chain:', err);
      }
    }
    const launchpad = this.launchpad.address();
    if (!launchpad) return new Map();
    const listings = await this.launchpad.allListings(project.id);
    const valid = await this.collections.validListings(listings, launchpad);
    return new Map(listings.filter((l) => valid.has(l.id)).map((l) => [l.tokenId, l.price]));
  }
}

function toItem(nft: { tokenId: bigint; owner: string }): NftItem {
  return { id: nft.tokenId, owner: nft.owner };
}
