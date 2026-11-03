import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IndexerApi, IndexedNft } from '../indexer/indexer-api';
import { CollectionItems, LARGE_COLLECTION } from './collection-items';
import { CollectionReader, NftItem } from './collection-reader';
import { LaunchpadReader } from './launchpad-reader';
import { Listing, Project } from './records';

const COLLECTION = 'AS125HSzXL9sphoniiqezuYKX3mGNuuS19yLQKvaJUGyEkfALpVTB';
const OWNER = 'AU126s93ZxbT4QUJcZYqsAxyMc3wv8nkHJYKYCtgQyEnZ8VGRM99P';
const SYNCED = new Date('2026-11-02T16:00:00Z');

function indexed(n: number): IndexedNft[] {
  return Array.from({ length: n }, (_, i) => ({
    collection: COLLECTION,
    tokenId: BigInt(i + 1),
    owner: OWNER,
    listingId: null,
    price: null,
  }));
}

function setup(
  options: {
    ready?: boolean;
    stats?: number | null;
    items?: () => Promise<IndexedNft[]>;
  } = {},
) {
  const chainItems: NftItem[] = [{ id: 1n, owner: 'AU1chain' }];
  const api = {
    ready: vi.fn(async () =>
      options.ready === false ? null : { syncedAt: SYNCED, intervalSeconds: 60, version: '1.4.0' },
    ),
    forget: vi.fn(),
    collectionStats: vi.fn(async () =>
      options.stats === null || options.stats === undefined
        ? null
        : {
            nfts: options.stats,
            holders: 1,
            listed: 0,
            floorPrice: null,
            sales: 0,
            volume: 0n,
            lastPrice: null,
          },
    ),
    collectionItems: vi.fn(
      async (_address: string, onPage?: (items: readonly IndexedNft[]) => void) => {
        const items = await (options.items ?? (async () => indexed(LARGE_COLLECTION)))();
        onPage?.(items.slice(0, 1));
        return items;
      },
    ),
    validListingPrices: vi.fn(async () => new Map([[1n, 5n]])),
  };
  const listing = { id: 3n, tokenId: 2n, price: 9n } as Listing;
  const collections = {
    items: vi.fn(async () => chainItems),
    validListings: vi.fn(async () => new Set([3n])),
  };
  const launchpad = {
    address: signal('AS1launchpad'),
    allListings: vi.fn(async () => [listing]),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: IndexerApi, useValue: api },
      { provide: CollectionReader, useValue: collections },
      { provide: LaunchpadReader, useValue: launchpad },
    ],
  });
  const calls: [number, boolean][] = [];
  const onItems = (items: NftItem[], done: boolean) => calls.push([items.length, done]);
  return { service: TestBed.inject(CollectionItems), api, collections, calls, onItems };
}

describe('CollectionItems', () => {
  it('reads a large collection from the API, page by page', async () => {
    const { service, collections, calls, onItems } = setup();
    const source = await service.items(COLLECTION, BigInt(LARGE_COLLECTION), onItems);
    expect(source).toEqual({ kind: 'api', syncedAt: SYNCED });
    expect(calls).toEqual([
      [1, false],
      [LARGE_COLLECTION, true],
    ]);
    expect(collections.items).not.toHaveBeenCalled();
  });

  it('asks the API for the size when the collection doesn’t tell (imports)', async () => {
    const { service, api, onItems } = setup({ stats: 2_000 });
    expect((await service.items(COLLECTION, null, onItems)).kind).toBe('api');
    expect(api.collectionStats).toHaveBeenCalledWith(COLLECTION);
  });

  it('reads the chain for a small or unindexed collection', async () => {
    for (const [known, stats] of [
      [BigInt(LARGE_COLLECTION - 1), null],
      [null, 10],
      [null, null],
    ] as const) {
      const { service, api, collections, calls, onItems } = setup({ stats });
      expect(await service.items(COLLECTION, known, onItems)).toEqual({ kind: 'chain' });
      expect(api.collectionItems).not.toHaveBeenCalled();
      if (known !== null) expect(api.ready).not.toHaveBeenCalled(); // no request at all
      expect(collections.items).toHaveBeenCalledOnce();
      expect(calls).toEqual([[1, true]]);
      TestBed.resetTestingModule();
    }
  });

  it('reads the chain when the API isn’t ready, fails, or knows no NFT yet', async () => {
    const down = setup({ ready: false });
    expect(await down.service.items(COLLECTION, 5_000n, down.onItems)).toEqual({ kind: 'chain' });
    expect(down.api.collectionItems).not.toHaveBeenCalled();
    TestBed.resetTestingModule();

    const failing = setup({ items: () => Promise.reject(new Error('HTTP 502')) });
    expect(await failing.service.items(COLLECTION, 5_000n, failing.onItems)).toEqual({
      kind: 'chain',
    });
    expect(failing.api.forget).toHaveBeenCalled();
    expect(failing.calls.at(-1)).toEqual([1, true]);
    TestBed.resetTestingModule();

    const behind = setup({ items: async () => [] });
    expect(await behind.service.items(COLLECTION, 5_000n, behind.onItems)).toEqual({
      kind: 'chain',
    });
    expect(behind.collections.items).toHaveBeenCalledOnce();
  });

  it('skips the API when asked for the chain', async () => {
    const { service, api, onItems } = setup();
    expect(await service.items(COLLECTION, 5_000n, onItems, true)).toEqual({ kind: 'chain' });
    expect(api.ready).not.toHaveBeenCalled();
  });

  it('reads listing prices from where the NFTs came from', async () => {
    const project = { id: 2n, address: COLLECTION } as Project;
    const { service, api, collections } = setup();
    expect([...(await service.prices(project, { kind: 'api', syncedAt: SYNCED }))]).toEqual([
      [1n, 5n],
    ]);
    expect(collections.validListings).not.toHaveBeenCalled();
    expect([...(await service.prices(project, { kind: 'chain' }))]).toEqual([[2n, 9n]]);
    api.validListingPrices.mockRejectedValueOnce(new Error('down'));
    expect([...(await service.prices(project, { kind: 'api', syncedAt: SYNCED }))]).toEqual([
      [2n, 9n],
    ]);
  });
});
