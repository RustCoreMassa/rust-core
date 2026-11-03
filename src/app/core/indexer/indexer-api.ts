import { Injectable, InjectionToken, inject } from '@angular/core';
import { NetworkStore } from '../network/network-store';
import { NETWORKS, NetworkId } from '../network/networks';

/** The HTTP client of the RustCore API. Replaced in tests. */
export const API_FETCH = new InjectionToken<typeof fetch>('API_FETCH', {
  providedIn: 'root',
  factory: () => (input, init) => fetch(input, init),
});

/** The API's largest page. */
export const API_PAGE_LIMIT = 200;
/** How long a status answer (usable or not) is kept before the API is asked again. */
const STATUS_TTL_MS = 60_000;
const TIMEOUT_MS = 8_000;
/** Retries of a request the API's rate limit refused (429). */
const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 5_000;

/** What the app needs of `/status`. */
export interface IndexerStatus {
  /** Start of the indexer's latest round. */
  readonly syncedAt: Date | null;
  readonly intervalSeconds: number;
  /** The indexed Launchpad's version. */
  readonly version: string | null;
}

/** `/collections/{address}/stats`, amounts as bigint. */
export interface IndexedStats {
  readonly nfts: number;
  readonly holders: number;
  readonly listed: number;
  readonly floorPrice: bigint | null;
  readonly sales: number;
  readonly volume: bigint;
  readonly lastPrice: bigint | null;
}

/** One NFT with its holder, and the holder's listing if any. */
export interface IndexedNft {
  readonly collection: string;
  readonly tokenId: bigint;
  readonly owner: string;
  readonly listingId: bigint | null;
  readonly price: bigint | null;
}

/** An error answer of the API (RFC 9457 problem details). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RawStatus {
  launchpad: string;
  stale: boolean;
  syncedAt: string | null;
  intervalSeconds: number;
  version: string | null;
}

interface RawStats {
  nfts: number;
  holders: number;
  listed: number;
  floorPrice: string | null;
  sales: number;
  volume: string;
  lastPrice: string | null;
}

interface RawNft {
  collection: string;
  tokenId: string;
  owner: string;
  listingId: number | null;
  price: string | null;
}

interface RawListing {
  tokenId: string;
  price: string;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

type Query = Record<string, string | undefined>;

/**
 * Reads from the RustCore API, a read-only cache of the Launchpad's final state (up to about
 * two minutes behind). The chain stays the source of truth: callers fall back to it whenever
 * `ready()` says no or a request fails, and anything that moves funds is checked on chain.
 */
@Injectable({ providedIn: 'root' })
export class IndexerApi {
  private readonly networks = inject(NetworkStore);
  private readonly http = inject(API_FETCH);
  private readonly statuses = new Map<
    NetworkId,
    { at: number; status: Promise<IndexerStatus | null> }
  >();

  /** The API's base URL on the selected network; null when it has none. */
  baseUrl(network: NetworkId = this.networks.network()): string | null {
    return NETWORKS[network].apiUrl;
  }

  /**
   * The API's status when the app may read from it: there is one for the network, it indexes
   * this network's Launchpad and its data isn't stale. null = read the chain.
   */
  ready(network: NetworkId = this.networks.network()): Promise<IndexerStatus | null> {
    const cached = this.statuses.get(network);
    if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.status;
    const status = this.readStatus(network);
    this.statuses.set(network, { at: Date.now(), status });
    return status;
  }

  /** Forgets the cached status, e.g. after a request failed. */
  forget(network: NetworkId = this.networks.network()): void {
    this.statuses.delete(network);
  }

  /** null when the collection isn't indexed (unknown, hidden, removed or launched just now). */
  async collectionStats(address: string): Promise<IndexedStats | null> {
    try {
      const raw = await this.get<RawStats>(`/collections/${address}/stats`);
      return {
        nfts: raw.nfts,
        holders: raw.holders,
        listed: raw.listed,
        floorPrice: optionalBigint(raw.floorPrice),
        sales: raw.sales,
        volume: BigInt(raw.volume),
        lastPrice: optionalBigint(raw.lastPrice),
      };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * Every NFT of a collection with its holder, lowest id first. `onPage` gets the list so far
   * after each page, so a large collection can be shown while the rest arrives.
   */
  async collectionItems(
    address: string,
    onPage?: (items: readonly IndexedNft[]) => void,
  ): Promise<IndexedNft[]> {
    const raw = await this.pages<RawNft>(`/collections/${address}/items`, {}, (so_far) =>
      onPage?.(so_far.map(nft)),
    );
    return raw.map(nft);
  }

  /**
   * Prices of the collection's listings that can still be bought as far as the API knows (the
   * seller holds the NFT, not expired; the approval isn't indexed), by token id.
   */
  async validListingPrices(collection: string): Promise<Map<bigint, bigint>> {
    const listings = await this.pages<RawListing>('/listings', {
      collection,
      validOnly: 'true',
      sort: 'price_asc',
    });
    const prices = new Map<bigint, bigint>();
    for (const l of listings) {
      const id = BigInt(l.tokenId);
      if (!prices.has(id)) prices.set(id, BigInt(l.price));
    }
    return prices;
  }

  /** Every NFT the address holds in the registered collections. */
  async ownerNfts(owner: string): Promise<IndexedNft[]> {
    return (await this.pages<RawNft>(`/owners/${owner}/nfts`, {})).map(nft);
  }

  private async readStatus(network: NetworkId): Promise<IndexerStatus | null> {
    const { apiUrl, launchpadAddress } = NETWORKS[network];
    if (!apiUrl || !launchpadAddress) return null;
    try {
      const raw = await this.get<RawStatus>('/status', {}, network);
      if (raw.launchpad !== launchpadAddress || raw.stale) return null;
      return {
        syncedAt: raw.syncedAt ? new Date(raw.syncedAt) : null,
        intervalSeconds: raw.intervalSeconds,
        version: raw.version ?? null,
      };
    } catch (err) {
      console.warn('[api] unavailable, reading the chain:', err);
      return null;
    }
  }

  /** Follows `nextCursor` to the last page; one network for the whole walk. */
  private async pages<T>(
    path: string,
    query: Query,
    onPage?: (items: readonly T[]) => void,
  ): Promise<T[]> {
    const network = this.networks.network();
    const items: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.get<Page<T>>(
        path,
        { ...query, limit: String(API_PAGE_LIMIT), cursor },
        network,
      );
      items.push(...page.items);
      onPage?.(items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return items;
  }

  private async get<T>(
    path: string,
    query: Query = {},
    network: NetworkId = this.networks.network(),
  ): Promise<T> {
    const base = this.baseUrl(network);
    if (!base) throw new Error('No RustCore API on this network.');
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) params.set(key, value);
    const search = params.size ? `?${params}` : '';
    const url = `${base}/api/v1${path}${search}`;
    for (let attempt = 0; ; attempt++) {
      const response = await this.http(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 429 && attempt < MAX_RETRIES) {
        await sleep(retryWait(response.headers.get('Retry-After')));
        continue;
      }
      if (!response.ok) throw new ApiError(response.status, await problemDetail(response));
      return (await response.json()) as T;
    }
  }
}

function nft(raw: RawNft): IndexedNft {
  return {
    collection: raw.collection,
    tokenId: BigInt(raw.tokenId),
    owner: raw.owner,
    listingId: raw.listingId === null || raw.listingId === undefined ? null : BigInt(raw.listingId),
    price: optionalBigint(raw.price),
  };
}

function optionalBigint(value: string | null | undefined): bigint | null {
  return value === null || value === undefined ? null : BigInt(value);
}

/** Retry-After in seconds (the API's nginx may send none): 1 s by default, 5 s at most. */
export function retryWait(header: string | null): number {
  const seconds = Number(header);
  if (!header || !Number.isFinite(seconds) || seconds < 0) return 1_000;
  return Math.min(seconds * 1_000, MAX_RETRY_WAIT_MS);
}

async function problemDetail(response: Response): Promise<string> {
  try {
    const problem = (await response.json()) as { detail?: string; title?: string };
    return `RustCore API: ${problem.detail || problem.title || response.status}`;
  } catch {
    return `RustCore API: HTTP ${response.status}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
