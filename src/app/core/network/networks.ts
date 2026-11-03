import { CHAIN_ID } from '@massalabs/massa-web3';

export type NetworkId = 'mainnet' | 'buildnet';

/**
 * What the home page shows of the membership collection before the chain answers. Name and
 * symbol can't change on-chain; logo and description can (the record read then replaces them).
 */
export interface MembershipPreview {
  readonly address: string;
  readonly name: string;
  readonly symbol: string;
  readonly logoUrl: string;
  readonly description: string;
}

export interface NetworkConfig {
  readonly id: NetworkId;
  readonly label: string;
  readonly chainId: bigint;
  /** Launchpad SC address on this network (smart-contract/deployments/<network>.json). */
  readonly launchpadAddress: string | null;
  /**
   * RustCore's membership collection, shown on the home page before the Launchpad's holder
   * discount names it (holderDiscount wins once set); null when there is none yet.
   */
  readonly membership: MembershipPreview | null;
  /**
   * The RustCore API (rust-core-api) indexing this network's Launchpad: the app reads large
   * collections from it, and the chain when it's null, down or behind.
   */
  readonly apiUrl: string | null;
}

export const NETWORKS: Readonly<Record<NetworkId, NetworkConfig>> = {
  mainnet: {
    id: 'mainnet',
    label: 'Mainnet',
    chainId: CHAIN_ID.Mainnet,
    // smart-contract/deployments/mainnet.json — deployed as v1.0.0, upgraded in place since
    launchpadAddress: 'AS1LbJFfhZpq8DehV7Uw5XQxCyfXtwgUUoiZSTsHcyhEGB7RPWyP',
    // Core Keepers (CKEEP), RustCore's collection (logo and description as set on 2026-10-23).
    membership: {
      address: 'AS125HSzXL9sphoniiqezuYKX3mGNuuS19yLQKvaJUGyEkfALpVTB',
      name: 'Core Keepers',
      symbol: 'CKEEP',
      logoUrl: 'https://nft.rustcoremassa.com/collection/logo.png',
      description:
        '1,000 cartoon crabs, the NFT collection of the RustCore team. Same crab, same pose: ' +
        'only the colors and traits change, and every Keeper carries some rust. 10 Genesis ' +
        'one-of-ones (#1-#10) and 990 Keepers with unique trait combinations. The mint funds ' +
        "the development and maintenance of RustCore's services, existing and new. Holders get " +
        'a discount on RustCore Launchpad fees, with more benefits to come. Art and a ' +
        'supporter badge, not an investment.',
    },
    apiUrl: 'https://api.rustcoremassa.com',
  },
  buildnet: {
    id: 'buildnet',
    label: 'Buildnet',
    chainId: CHAIN_ID.Buildnet,
    // smart-contract/deployments/buildnet-1.6.0.json (v1.6.0: presale whitelist and vesting).
    // Older ones: buildnet-1.4.0.json, buildnet-1.2.0.json, and buildnet.json (upgraded in
    // place to v1.1.0).
    launchpadAddress: 'AS12TLJkNQinjSRdWdB6LxrHWzXwfgr9QGWjfsTa5UR9P1XCYT99d',
    membership: null,
    // No public buildnet API. To try one locally: `cargo run` in rust-core-api with
    // RUSTCORE__API__BIND=127.0.0.1:8081 (Massa Station uses 8080), then 'http://localhost:8081'.
    apiUrl: null,
  },
};

/** The Launchpad is live on mainnet; buildnet stays one click away for testing. */
export const DEFAULT_NETWORK: NetworkId = 'mainnet';

export function networkByChainId(chainId: bigint): NetworkConfig | undefined {
  return Object.values(NETWORKS).find((n) => n.chainId === chainId);
}
