import { TestBed } from '@angular/core/testing';
import { ENABLED_NETWORKS, NetworkStore } from '../network/network-store';
import { NETWORKS } from '../network/networks';
import { LOCAL_STORE, memoryStore } from '../platform/storage';
import { API_FETCH, ApiError, IndexerApi, retryWait } from './indexer-api';

const BASE = 'https://api.rustcoremassa.com/api/v1';
const COLLECTION = 'AS125HSzXL9sphoniiqezuYKX3mGNuuS19yLQKvaJUGyEkfALpVTB';
const OWNER = 'AU126s93ZxbT4QUJcZYqsAxyMc3wv8nkHJYKYCtgQyEnZ8VGRM99P';

function status(overrides: Record<string, unknown> = {}) {
  return {
    rpcUrl: 'https://mainnet.massa.net/api/v2',
    launchpad: NETWORKS.mainnet.launchpadAddress,
    version: '1.4.0',
    syncedAt: '2026-11-02T16:04:30.470726Z',
    intervalSeconds: 60,
    stale: false,
    steps: [],
    ...overrides,
  };
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

/** Answers by URL; every URL asked is recorded. */
function setup(answer: (url: URL) => Response | Promise<Response>, network = 'mainnet') {
  const asked: URL[] = [];
  const http = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    asked.push(url);
    return answer(url);
  });
  const store = memoryStore();
  store.setItem('launchpad.network', network);
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCAL_STORE, useValue: store },
      { provide: ENABLED_NETWORKS, useValue: ['mainnet', 'buildnet'] },
      { provide: API_FETCH, useValue: http },
    ],
  });
  return { api: TestBed.inject(IndexerApi), networks: TestBed.inject(NetworkStore), asked, http };
}

describe('IndexerApi', () => {
  it('is ready when it indexes this network’s Launchpad and isn’t stale', async () => {
    const { api, http } = setup(() => json(status()));
    const ready = await api.ready();
    expect(ready).toEqual({
      syncedAt: new Date('2026-11-02T16:04:30.470726Z'),
      intervalSeconds: 60,
      version: '1.4.0',
    });
    await api.ready();
    expect(http).toHaveBeenCalledTimes(1); // cached
  });

  it('is not ready for another Launchpad, stale data, an error or no API', async () => {
    expect(await setup(() => json(status({ launchpad: 'AS1other' }))).api.ready()).toBeNull();
    TestBed.resetTestingModule();
    expect(await setup(() => json(status({ stale: true }))).api.ready()).toBeNull();
    TestBed.resetTestingModule();
    expect(await setup(() => new Response('', { status: 502 })).api.ready()).toBeNull();
    TestBed.resetTestingModule();
    const down = setup(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await down.api.ready()).toBeNull();
    TestBed.resetTestingModule();
    const buildnet = setup(() => json(status()), 'buildnet');
    expect(NETWORKS.buildnet.apiUrl).toBeNull();
    expect(await buildnet.api.ready()).toBeNull();
    expect(buildnet.http).not.toHaveBeenCalled();
  });

  it('asks again after forget()', async () => {
    const { api, http } = setup(() => json(status()));
    await api.ready();
    api.forget();
    await api.ready();
    expect(http).toHaveBeenCalledTimes(2);
  });

  it('follows the cursor to the last page and converts big numbers', async () => {
    const { api, asked } = setup((url) =>
      url.searchParams.get('cursor')
        ? json({
            items: [
              { collection: COLLECTION, tokenId: '3', owner: OWNER, listingId: null, price: null },
            ],
            nextCursor: null,
          })
        : json({
            items: [
              {
                collection: COLLECTION,
                tokenId: '1',
                owner: OWNER,
                listingId: 7,
                price: '5000000000',
              },
              {
                collection: COLLECTION,
                tokenId:
                  '115792089237316195423570985008687907853269984665640564039457584007913129639935',
                owner: OWNER,
                listingId: null,
                price: null,
              },
            ],
            nextCursor: 'Mg',
          }),
    );
    const partial: number[] = [];
    const items = await api.collectionItems(COLLECTION, (so_far) => partial.push(so_far.length));
    expect(partial).toEqual([2, 3]);
    expect(items.map((i) => i.tokenId)).toEqual([1n, 2n ** 256n - 1n, 3n]);
    expect(items[0]).toEqual({
      collection: COLLECTION,
      tokenId: 1n,
      owner: OWNER,
      listingId: 7n,
      price: 5_000_000_000n,
    });
    expect(asked.map((u) => u.href)).toEqual([
      `${BASE}/collections/${COLLECTION}/items?limit=200`,
      `${BASE}/collections/${COLLECTION}/items?limit=200&cursor=Mg`,
    ]);
  });

  it('reads valid listing prices, cheapest per NFT', async () => {
    const { api, asked } = setup(() =>
      json({
        items: [
          { tokenId: '4', price: '1000000000' },
          { tokenId: '9', price: '2000000000' },
        ],
        nextCursor: null,
      }),
    );
    const prices = await api.validListingPrices(COLLECTION);
    expect([...prices]).toEqual([
      [4n, 1_000_000_000n],
      [9n, 2_000_000_000n],
    ]);
    expect(asked[0].searchParams.get('validOnly')).toBe('true');
    expect(asked[0].searchParams.get('collection')).toBe(COLLECTION);
  });

  it('gives null stats for a collection it doesn’t index, and throws other errors', async () => {
    const problem = (status: number, detail: string) =>
      json({ type: 'about:blank', title: 'x', status, detail }, { status });
    const { api } = setup((url) =>
      url.pathname.includes(COLLECTION) ? problem(404, 'not found') : problem(400, 'bad address'),
    );
    expect(await api.collectionStats(COLLECTION)).toBeNull();
    const error = await api.collectionStats('AS1bad').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toBe('RustCore API: bad address');
  });

  it('converts stats', async () => {
    const { api } = setup(() =>
      json({
        address: COLLECTION,
        nfts: 1000,
        holders: 421,
        listed: 3,
        floorPrice: '700000000000',
        sales: 2,
        volume: '1500000000000',
        lastPrice: null,
      }),
    );
    expect(await api.collectionStats(COLLECTION)).toEqual({
      nfts: 1000,
      holders: 421,
      listed: 3,
      floorPrice: 700_000_000_000n,
      sales: 2,
      volume: 1_500_000_000_000n,
      lastPrice: null,
    });
  });

  it('retries after a 429, then gives up', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const { api } = setup(() =>
        ++calls < 2
          ? new Response('', { status: 429, headers: { 'Retry-After': '1' } })
          : json({ items: [], nextCursor: null }),
      );
      const nfts = api.ownerNfts(OWNER);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await nfts).toEqual([]);
      expect(calls).toBe(2);

      TestBed.resetTestingModule();
      const busy = setup(() => new Response('', { status: 429 }));
      const refused = busy.api.ownerNfts(OWNER).catch((e) => e);
      await vi.advanceTimersByTimeAsync(5_000);
      expect((await refused).status).toBe(429);
      expect(busy.http).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits what Retry-After asks, within bounds', () => {
    expect(retryWait(null)).toBe(1_000);
    expect(retryWait('2')).toBe(2_000);
    expect(retryWait('60')).toBe(5_000);
    expect(retryWait('soon')).toBe(1_000);
  });
});
