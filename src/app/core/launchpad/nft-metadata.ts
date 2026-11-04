import { Injectable, inject } from '@angular/core';
import { CollectionReader } from './collection-reader';
import { httpUrl, localGatewayOf } from '../utils/ipfs';
import { stripHidden } from '../utils/hidden-chars';

export interface NftAttribute {
  trait: string;
  value: string;
}

/** The usual NFT metadata JSON, cleaned: every field is plain text, the image a loadable URL. */
export interface NftMetadata {
  name: string;
  description: string;
  /** https URL ('' when missing or unusable). */
  image: string;
  /** Where the image link points: IPFS (content-addressed, can't change), a web server, or none. */
  imageSource: LinkSource;
  attributes: NftAttribute[];
}

export type LinkSource = 'ipfs' | 'web' | '';

/** IPFS for ipfs:// links (and a local node's gateway links while developing), else web. */
export function linkSource(link: string): LinkSource {
  if (!link) return '';
  return link.startsWith('ipfs://') || localGatewayOf(link) ? 'ipfs' : 'web';
}

const MAX_TEXT = 2_000;
/** Metadata JSON is a few KB; anything far bigger is refused before it can freeze the tab. */
export const MAX_METADATA_BYTES = 256 * 1024;
const MAX_ATTRIBUTES = 50;
const TIMEOUT_MS = 15_000;

/**
 * Reads NFT metadata JSON (from IPFS through the gateway, or https). The JSON is written by the
 * collection's creator, so nothing in it is trusted: only known fields are kept, as text, and
 * only https / ipfs image links. Results are cached per URL for the session.
 */
@Injectable({ providedIn: 'root' })
export class NftMetadataLoader {
  private readonly cache = new Map<string, Promise<NftMetadata | null>>();

  /** null when the URI can't be loaded or isn't metadata JSON. */
  load(uri: string): Promise<NftMetadata | null> {
    let entry = this.cache.get(uri);
    if (!entry) {
      entry = this.fetch(uri);
      this.cache.set(uri, entry);
    }
    return entry;
  }

  private async fetch(uri: string): Promise<NftMetadata | null> {
    const url = httpUrl(uri);
    if (!url) return null;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        referrerPolicy: 'no-referrer',
        credentials: 'omit',
      });
      if (!response.ok) return null;
      const text = await readLimited(response, MAX_METADATA_BYTES);
      return text === null
        ? null
        : parseMetadata(JSON.parse(text), localGatewayOf(url) ?? undefined);
    } catch {
      return null;
    }
  }
}

/**
 * The response's text, or null when it's bigger than `max` bytes: refused from its
 * Content-Length when it gives one, else read as a stream and dropped as soon as it passes `max`.
 */
export async function readLimited(response: Response, max: number): Promise<string | null> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > max) {
    void response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) {
    const text = await response.text();
    return new TextEncoder().encode(text).length > max ? null : text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** `gateway`: where the JSON's ipfs:// links resolve (default: the configured gateway). */
export function parseMetadata(json: unknown, gateway?: string): NftMetadata | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const data = json as Record<string, unknown>;
  const attributes = Array.isArray(data['attributes']) ? data['attributes'] : [];
  const image = httpUrl(text(data['image']), gateway);
  return {
    name: text(data['name']),
    description: text(data['description']),
    image,
    imageSource: image ? linkSource(text(data['image'])) : '',
    attributes: attributes
      .slice(0, MAX_ATTRIBUTES)
      .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
      .map((a) => ({ trait: text(a['trait_type']), value: text(a['value']) }))
      .filter((a) => a.trait !== '' && a.value !== ''),
  };
}

function text(value: unknown): string {
  if (typeof value === 'string') return stripHidden(value).slice(0, MAX_TEXT);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Reads at most this many NFTs (uri + metadata) at once — the public RPC rejects bursts. */
const QUEUE_CONCURRENCY = 4;

/**
 * Metadata of one NFT by collection and id, through a shared queue so that a page full of cards
 * never fires dozens of RPC calls at once. Results are cached for the session.
 */
@Injectable({ providedIn: 'root' })
export class NftMetadataQueue {
  private readonly collections = inject(CollectionReader);
  private readonly loader = inject(NftMetadataLoader);
  private readonly cache = new Map<string, Promise<NftMetadata | null>>();
  private readonly waiting: (() => void)[] = [];
  private running = 0;

  get(collection: string, id: bigint): Promise<NftMetadata | null> {
    const key = `${collection}/${id}`;
    let entry = this.cache.get(key);
    if (!entry) {
      entry = this.throttled(async () => {
        try {
          return await this.loader.load(await this.collections.uri(collection, id));
        } catch {
          return null;
        }
      });
      this.cache.set(key, entry);
    }
    return entry;
  }

  private async throttled<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= QUEUE_CONCURRENCY) await new Promise<void>((r) => this.waiting.push(r));
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}
