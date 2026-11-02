/** The RustCore API's endpoints, as the Public API page lists them (rust-core-api docs/API.md). */

export interface ApiParam {
  readonly name: string;
  readonly text: string;
}

export interface ApiEndpoint {
  readonly path: string;
  readonly summary: string;
  readonly params: readonly ApiParam[];
  /** What each item (or the answer) holds. */
  readonly returns: string;
  /** A request to try, relative to the base URL (mainnet data). */
  readonly example: string;
}

export interface ApiGroup {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly endpoints: readonly ApiEndpoint[];
}

/** Core Keepers on mainnet: a real collection for the examples. */
const COLLECTION = 'AS125HSzXL9sphoniiqezuYKX3mGNuuS19yLQKvaJUGyEkfALpVTB';
/** RustCore's public address (README donation address). */
const OWNER = 'AU126s93ZxbT4QUJcZYqsAxyMc3wv8nkHJYKYCtgQyEnZ8VGRM99P';

const PAGING: readonly ApiParam[] = [
  { name: 'cursor', text: 'the previous page’s nextCursor' },
  { name: 'limit', text: '1–200, 50 by default' },
];

export const API_GROUPS: readonly ApiGroup[] = [
  {
    id: 'status',
    title: 'Status',
    intro: 'What is indexed and how fresh it is.',
    endpoints: [
      {
        path: '/status',
        summary: 'The node read, the Launchpad indexed and when each step last succeeded.',
        params: [],
        returns:
          'rpcUrl, launchpad, version (the Launchpad’s), syncedAt (start of the latest round), intervalSeconds, stale (true after three rounds without a registry read: read the chain instead), steps[] — name (projects, holders, listings, sales, presales), lastAttemptAt, lastSuccessAt, lastError, lastDurationMs, items.',
        example: '/api/v1/status',
      },
      {
        path: '/health',
        summary:
          'For monitoring: {"status": "up"} (200) when the API and its database answer, {"status": "down"} (503) otherwise. Outside /api/v1.',
        params: [],
        returns: 'status.',
        example: '/health',
      },
    ],
  },
  {
    id: 'registry',
    title: 'Registry',
    intro:
      'Every token and collection launched or imported on the Launchpad. Projects the admin removed or hid are left out.',
    endpoints: [
      {
        path: '/api/v1/projects',
        summary: 'Tokens and collections, newest first.',
        params: [
          { name: 'kind', text: 'token or collection; both when absent' },
          {
            name: 'category',
            text: 'category index — collections: 0 Art, 1 PFP, 2 Gaming, 3 Music, 4 Photography, 5 Collectibles, 6 Other; tokens: 0 Meme, 1 Utility, 2 Gaming, 3 DeFi, 4 Community, 5 Other',
          },
          { name: 'creator', text: 'the address that launched or imported it' },
          { name: 'verified', text: 'true or false' },
          { name: 'q', text: 'part of the name or symbol, any case (1–64 characters)' },
          ...PAGING,
        ],
        returns:
          'kind, id (registry id, per kind), address, source (launched or imported), creator, createdAt, templateVersion (0 for imports), codeHash, name, symbol, decimals, mutable, category, categoryName, verified, royaltyBps, royaltyReceiver, info (description, logoUrl, bannerUrl, website, twitter, telegram, discord).',
        example: '/api/v1/projects?kind=collection&limit=10',
      },
      {
        path: '/api/v1/projects/{address}',
        summary: 'One token or collection; 404 when it isn’t in the registry.',
        params: [],
        returns: 'The same fields as a /projects item.',
        example: `/api/v1/projects/${COLLECTION}`,
      },
    ],
  },
  {
    id: 'collections',
    title: 'Collections',
    intro:
      'Every NFT of every registered collection with its current holder, read again each round from the collection’s storage. A 404 when the address isn’t a collection of the registry.',
    endpoints: [
      {
        path: '/api/v1/collections/{address}/items',
        summary:
          'Its NFTs by token id, each with its holder and, when the holder listed it, the listing.',
        params: [{ name: 'owner', text: 'keep only one holder’s NFTs' }, ...PAGING],
        returns: 'collection, tokenId, owner, listingId (or null), price (or null).',
        example: `/api/v1/collections/${COLLECTION}/items?limit=20`,
      },
      {
        path: '/api/v1/collections/{address}/items/{tokenId}',
        summary: 'One NFT (tokenId in decimal); 404 when it was never minted or was burned.',
        params: [],
        returns: 'The same fields as an /items item.',
        example: `/api/v1/collections/${COLLECTION}/items/1`,
      },
      {
        path: '/api/v1/collections/{address}/holders',
        summary: 'Its holders, most NFTs first, then by address.',
        params: PAGING,
        returns: 'owner, count.',
        example: `/api/v1/collections/${COLLECTION}/holders`,
      },
      {
        path: '/api/v1/collections/{address}/stats',
        summary: 'Its figures.',
        params: [],
        returns:
          'nfts (existing), holders (distinct), listed (valid listings: the seller holds the NFT, not expired), floorPrice, sales, volume, lastPrice.',
        example: `/api/v1/collections/${COLLECTION}/stats`,
      },
    ],
  },
  {
    id: 'owners',
    title: 'Owners',
    intro: 'What an address holds across the registered collections.',
    endpoints: [
      {
        path: '/api/v1/owners/{address}/nfts',
        summary: 'Every NFT the address holds, by collection address then token id.',
        params: [{ name: 'collection', text: 'keep one collection' }, ...PAGING],
        returns: 'The same fields as a collection’s /items item.',
        example: `/api/v1/owners/${OWNER}/nfts`,
      },
    ],
  },
  {
    id: 'marketplace',
    title: 'Marketplace',
    intro:
      'Listings as the Launchpad keeps them, and every sale. The NFT’s approval isn’t indexed: always check a purchase on chain (the Launchpad’s buyProblem) before signing.',
    endpoints: [
      {
        path: '/api/v1/listings',
        summary: 'Active listings.',
        params: [
          { name: 'collection', text: 'one collection' },
          { name: 'seller', text: 'one seller' },
          { name: 'tokenId', text: 'with collection: the listing of one NFT' },
          {
            name: 'validOnly',
            text: 'true keeps only those that can still be bought: the seller holds the NFT and it hasn’t expired (default false)',
          },
          { name: 'sort', text: 'newest (default), price_asc or price_desc' },
          ...PAGING,
        ],
        returns:
          'id, collectionId, collection, tokenId, seller, price, createdAt, expiresAt (null = never), feeBps, royaltyBps and royaltyReceiver (null before Launchpad v1.3.1), sellerHolds, expired.',
        example: '/api/v1/listings?validOnly=true&sort=price_asc',
      },
      {
        path: '/api/v1/listings/{id}',
        summary: 'One active listing; 404 once it was bought or cancelled.',
        params: [],
        returns: 'The same fields as a /listings item.',
        example: '/api/v1/listings/1',
      },
      {
        path: '/api/v1/sales',
        summary: 'Sales, newest first.',
        params: [
          { name: 'collection', text: 'one collection' },
          { name: 'tokenId', text: 'with collection: the sales of one NFT' },
          { name: 'seller', text: 'one seller' },
          { name: 'buyer', text: 'one buyer' },
          ...PAGING,
        ],
        returns:
          'id, listingId, collectionId, collection, tokenId, seller, buyer, price (royalty included), royalty, fee, soldAt.',
        example: '/api/v1/sales',
      },
    ],
  },
  {
    id: 'presales',
    title: 'Presales',
    intro: 'Token presales with their status and what they raised.',
    endpoints: [
      {
        path: '/api/v1/presales',
        summary: 'Presales, newest first.',
        params: [
          { name: 'status', text: 'open, success, failed or cancelled' },
          { name: 'token', text: 'one token address' },
          { name: 'creator', text: 'one creator' },
          ...PAGING,
        ],
        returns:
          'id, tokenId (registry id), token, creator, tokensForSale, rate (token units per 1 MAS), softCap, hardCap, minBuy, maxBuy (0 = no limit), start, end, raised, contributors, status, withdrawn, feeBps. status is the contract’s: a presale past its end stays open until someone finalizes it on chain.',
        example: '/api/v1/presales',
      },
      {
        path: '/api/v1/presales/{id}',
        summary: 'One presale; 404 when it doesn’t exist.',
        params: [],
        returns: 'The same fields as a /presales item.',
        example: '/api/v1/presales/1',
      },
    ],
  },
];
