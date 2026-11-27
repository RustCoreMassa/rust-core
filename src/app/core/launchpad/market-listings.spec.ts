import { TestBed } from '@angular/core/testing';
import { IndexerApi } from '../indexer/indexer-api';
import { CollectionReader } from './collection-reader';
import { LaunchpadReader } from './launchpad-reader';
import { MarketListings } from './market-listings';
import { Listing } from './records';

const LAUNCHPAD = 'AS1LbJFfhZpq8DehV7Uw5XQxCyfXtwgUUoiZSTsHcyhEGB7RPWyP';
const SYNCED = new Date('2026-11-02T16:00:00Z');

function setup(options: { ready?: boolean; fails?: boolean } = {}) {
  const fromApi = [{ id: 1n } as Listing];
  const onChain = [{ id: 2n } as Listing, { id: 3n } as Listing];
  const api = {
    ready: vi.fn(async () =>
      options.ready === false ? null : { syncedAt: SYNCED, intervalSeconds: 60, version: '1.8.0' },
    ),
    forget: vi.fn(),
    validListings: vi.fn(async () => {
      if (options.fails) throw new TypeError('Failed to fetch');
      return fromApi;
    }),
  };
  const launchpad = { allListings: vi.fn(async () => onChain) };
  // Listing 2 is stale (NFT moved or approval withdrawn).
  const collections = { validListings: vi.fn(async () => new Set([3n])) };
  TestBed.configureTestingModule({
    providers: [
      { provide: IndexerApi, useValue: api },
      { provide: LaunchpadReader, useValue: launchpad },
      { provide: CollectionReader, useValue: collections },
    ],
  });
  return { market: TestBed.inject(MarketListings), api, launchpad, collections, fromApi };
}

describe('MarketListings', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));

  it('reads the listings from the API when it is up, without touching the chain', async () => {
    const { market, launchpad, fromApi } = setup();
    expect(await market.forSale(LAUNCHPAD)).toEqual({
      listings: fromApi,
      source: { kind: 'api', syncedAt: SYNCED },
    });
    expect(launchpad.allListings).not.toHaveBeenCalled();
  });

  it('reads the chain, valid listings only, when the API is down', async () => {
    const { market, api, collections } = setup({ ready: false });
    const result = await market.forSale(LAUNCHPAD);
    expect(result.listings.map((l) => l.id)).toEqual([3n]);
    expect(result.source).toEqual({ kind: 'chain' });
    expect(api.validListings).not.toHaveBeenCalled();
    expect(collections.validListings).toHaveBeenCalledWith(expect.any(Array), LAUNCHPAD);
  });

  it('falls back to the chain when a request fails, and asks the status again next time', async () => {
    const { market, api } = setup({ fails: true });
    const result = await market.forSale(LAUNCHPAD);
    expect(result.source).toEqual({ kind: 'chain' });
    expect(result.listings.map((l) => l.id)).toEqual([3n]);
    expect(api.forget).toHaveBeenCalled();
  });

  it('reads the chain when asked to', async () => {
    const { market, api } = setup();
    expect((await market.forSale(LAUNCHPAD, true)).source).toEqual({ kind: 'chain' });
    expect(api.ready).not.toHaveBeenCalled();
  });
});
