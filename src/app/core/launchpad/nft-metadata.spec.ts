import { TestBed } from '@angular/core/testing';
import {
  MAX_METADATA_BYTES,
  NftMetadataLoader,
  linkSource,
  parseMetadata,
  readLimited,
} from './nft-metadata';
import { IPFS_GATEWAY, configureUrls } from '../utils/ipfs';
import { readMintInfo, tokenIdFromKey } from './collection-reader';
import { Args } from '@massalabs/massa-web3';

describe('parseMetadata', () => {
  it('keeps the usual fields as text', () => {
    const meta = parseMetadata({
      name: 'Cat #1',
      description: 'A cat',
      image: 'ipfs://bafyCat/1.png',
      attributes: [
        { trait_type: 'Fur', value: 'Orange' },
        { trait_type: 'Level', value: 3 },
      ],
    });
    expect(meta).toEqual({
      name: 'Cat #1',
      description: 'A cat',
      image: 'https://ipfs.io/ipfs/bafyCat/1.png',
      imageSource: 'ipfs',
      attributes: [
        { trait: 'Fur', value: 'Orange' },
        { trait: 'Level', value: '3' },
      ],
    });
  });

  it('drops what it can’t trust or use', () => {
    const meta = parseMetadata({
      name: { html: '<script>' },
      image: 'javascript:alert(1)',
      attributes: [null, 'x', { trait_type: '', value: 'y' }, { trait_type: 'Ok', value: {} }],
    });
    expect(meta).toEqual({
      name: '',
      description: '',
      image: '',
      imageSource: '',
      attributes: [],
    });
  });

  it('refuses anything that isn’t a JSON object', () => {
    expect(parseMetadata(null)).toBeNull();
    expect(parseMetadata([1, 2])).toBeNull();
    expect(parseMetadata('text')).toBeNull();
  });
});

describe('NftMetadataLoader', () => {
  afterEach(() => {
    configureUrls({ gateway: IPFS_GATEWAY, allowLocal: false });
    vi.unstubAllGlobals();
  });

  it('resolves the ipfs:// image of metadata from a local node through that node (dev)', async () => {
    configureUrls({ allowLocal: true });
    const fetch = vi.fn(async () => Response.json({ name: 'One', image: 'ipfs://bafyImg/1.png' }));
    vi.stubGlobal('fetch', fetch);
    const meta = await TestBed.inject(NftMetadataLoader).load(
      'http://127.0.0.1:8090/ipfs/bafyMeta/1.json',
    );
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8090/ipfs/bafyMeta/1.json',
      expect.anything(),
    );
    expect(meta?.image).toBe('http://127.0.0.1:8090/ipfs/bafyImg/1.png');
  });

  it('uses the public gateway for metadata from anywhere else', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ image: 'ipfs://bafyImg/1.png' })),
    );
    const meta = await TestBed.inject(NftMetadataLoader).load('ipfs://bafyMeta/1.json');
    expect(meta?.image).toBe('https://ipfs.io/ipfs/bafyImg/1.png');
  });
});

describe('linkSource', () => {
  it('tells IPFS from a web server', () => {
    expect(linkSource('ipfs://bafyA/1.json')).toBe('ipfs');
    expect(linkSource('https://nft.example/1.json')).toBe('web');
    expect(linkSource('')).toBe('');
    expect(parseMetadata({ image: 'https://nft.example/1.png' })?.imageSource).toBe('web');
  });
});

describe('readLimited', () => {
  const stream = (chunks: number[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const size of chunks) controller.enqueue(new Uint8Array(size).fill(0x20));
        controller.close();
      },
    });

  it('reads a small body', async () => {
    expect(await readLimited(new Response('{"name":"A"}'), 1000)).toBe('{"name":"A"}');
  });

  it('refuses a body announced too big without reading it', async () => {
    const response = new Response(stream([10]), { headers: { 'content-length': '5000' } });
    expect(await readLimited(response, 1000)).toBeNull();
  });

  it('stops reading as soon as a body without a length passes the limit', async () => {
    expect(await readLimited(new Response(stream([600, 600, 600])), 1000)).toBeNull();
    expect(await readLimited(new Response(stream([500, 500])), 1000)).toHaveLength(1000);
  });

  it('turns oversized metadata into "can\'t be loaded"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream([MAX_METADATA_BYTES, 1]))),
    );
    expect(await TestBed.inject(NftMetadataLoader).load('ipfs://bafyHuge/1.json')).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('collection storage decoding', () => {
  it('reads a token id from an owner key (prefix 0x04 + u256 little-endian)', () => {
    const key = new Uint8Array(33);
    key[0] = 0x04;
    key[1] = 0x2c;
    key[2] = 0x01; // 300
    expect(tokenIdFromKey(key)).toBe(300n);
  });

  it('reads mintInfo in the contract’s order', () => {
    const bytes = new Args()
      .addU256(10n)
      .addU256(4n)
      .addU256(3n)
      .addU64(2_000_000_000n)
      .addU32(2n)
      .addBool(true)
      .addString('ipfs://bafy/')
      .addBool(false)
      .serialize();
    expect(readMintInfo(bytes)).toEqual({
      maxSupply: 10n,
      minted: 4n,
      totalSupply: 3n,
      mintPrice: 2_000_000_000n,
      maxPerWallet: 2,
      publicMint: true,
      baseURI: 'ipfs://bafy/',
      frozen: false,
    });
  });
});
