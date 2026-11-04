import { CollectionState } from './collection-reader';
import { LinkSource, linkSource } from './nft-metadata';

/**
 * Whether an NFT's metadata and image can still change after you buy it:
 * - fixed: both on IPFS (content-addressed), the token's link can't move (frozen collection or
 *   the token's own URI) and the collection's code can't be upgraded;
 * - owner: on IPFS, but the collection's owner can still point it elsewhere;
 * - changeable: on a web server, whose operator can serve anything at any time;
 * - unknown: an imported collection, whose code the Launchpad didn't write.
 */
export type StabilityLevel = 'fixed' | 'owner' | 'changeable' | 'unknown';

export interface MetadataStability {
  level: StabilityLevel;
  text: string;
}

export interface StabilityInput {
  /** The token's uri() as the collection returns it. */
  uri: string;
  imageSource: LinkSource;
  tokenId: bigint;
  /** The collection's live state; null while unknown. */
  state: CollectionState | null;
}

export function metadataStability(input: StabilityInput): MetadataStability {
  if (linkSource(input.uri) === 'web')
    return {
      level: 'changeable',
      text: 'Its metadata is on a web server: whoever runs it can change it at any time.',
    };
  if (input.imageSource === 'web')
    return {
      level: 'changeable',
      text: 'Its image is on a web server: whoever runs it can change it at any time.',
    };
  const mint = input.state?.mint;
  if (!mint)
    return {
      level: 'unknown',
      text: "Imported collection: the Launchpad can't tell whether its metadata can change.",
    };
  if (input.state?.mutable !== false)
    return {
      level: 'owner',
      text: "The collection's code can be upgraded by its owner, and its metadata with it.",
    };
  const throughBase = input.uri === `${mint.baseURI}${input.tokenId}.json`;
  if (throughBase && !mint.frozen)
    return {
      level: 'owner',
      text: "On IPFS, but the collection's owner can still point it to other files (not frozen).",
    };
  return { level: 'fixed', text: "On IPFS and frozen: its metadata and image can't change." };
}
