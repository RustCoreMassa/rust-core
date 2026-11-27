import { TestBed } from '@angular/core/testing';
import { IndexerApi } from '../indexer/indexer-api';
import { LaunchpadReader, PAGE_SIZE } from './launchpad-reader';
import { MAX_CHAIN_SALES, NftSales } from './nft-sales';
import { Project, Sale } from './records';

const PROJECT = {
  id: 3n,
  address: 'AS125HSzXL9sphoniiqezuYKX3mGNuuS19yLQKvaJUGyEkfALpVTB',
} as Project;
const TOKEN = 7n;

function sale(id: number, tokenId: bigint): Sale {
  return { id: BigInt(id), tokenId } as Sale;
}

/**
 * A collection with `total` sales, ids total..1 newest first; every tenth sale is of TOKEN.
 * `api`: what the API gives for TOKEN, or null when it is down; 'fails' when its request fails.
 */
function setup(total: number, api: Sale[] | null | 'fails' = null) {
  const all = Array.from({ length: total }, (_, i) => {
    const id = total - i;
    return sale(id, id % 10 === 0 ? TOKEN : 1n);
  });
  const launchpad = {
    sales: vi.fn(async (_collectionId: bigint, offset = 0, limit = PAGE_SIZE) => ({
      total,
      items: all.slice(offset, offset + limit),
    })),
  };
  const indexer = {
    ready: vi.fn(async () =>
      api === null ? null : { syncedAt: null, intervalSeconds: 60, version: '1.8.0' },
    ),
    forget: vi.fn(),
    nftSales: vi.fn(async () => {
      if (api === 'fails') throw new TypeError('Failed to fetch');
      return api ?? [];
    }),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: LaunchpadReader, useValue: launchpad },
      { provide: IndexerApi, useValue: indexer },
    ],
  });
  return { sales: TestBed.inject(NftSales), launchpad, indexer };
}

const ids = (sales: Sale[]) => sales.map((s) => Number(s.id));

describe('NftSales', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));

  it('needs one chain read while the collection has a page of sales or less', async () => {
    const { sales, launchpad, indexer } = setup(PAGE_SIZE);
    expect(ids(await sales.history(PROJECT, TOKEN))).toEqual([50, 40, 30, 20, 10]);
    expect(launchpad.sales).toHaveBeenCalledTimes(1);
    expect(indexer.ready).not.toHaveBeenCalled();
  });

  it('takes older sales from the API, merged with the newest page from the chain', async () => {
    // The API is a little behind: it doesn't have sale 120 yet.
    const fromApi = [110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map((id) => sale(id, TOKEN));
    const { sales, launchpad, indexer } = setup(120, fromApi);
    expect(ids(await sales.history(PROJECT, TOKEN))).toEqual([
      120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10,
    ]);
    expect(launchpad.sales).toHaveBeenCalledTimes(1);
    expect(indexer.nftSales).toHaveBeenCalledWith(PROJECT.address, TOKEN);
  });

  it('pages through the chain when the API is down', async () => {
    const { sales, launchpad } = setup(120);
    const history = await sales.history(PROJECT, TOKEN);
    expect(ids(history)).toEqual([120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
    expect(launchpad.sales.mock.calls.map((c) => c[1] ?? 0)).toEqual([0, 50, 100]);
  });

  it('pages through the chain when the API request fails', async () => {
    const { sales, indexer } = setup(120, 'fails');
    expect(ids(await sales.history(PROJECT, TOKEN))).toHaveLength(12);
    expect(indexer.forget).toHaveBeenCalled();
  });

  it(`reads at most ${MAX_CHAIN_SALES} sales from the chain`, async () => {
    const { sales, launchpad } = setup(MAX_CHAIN_SALES + 500);
    const history = await sales.history(PROJECT, TOKEN);
    expect(launchpad.sales).toHaveBeenCalledTimes(MAX_CHAIN_SALES / PAGE_SIZE);
    expect(history).toHaveLength(MAX_CHAIN_SALES / 10);
    expect(Number(history.at(-1)!.id)).toBe(510);
  });
});
