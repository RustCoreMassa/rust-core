import { CollectionState, MintInfo } from './collection-reader';
import { metadataStability } from './metadata-stability';

const mint = (frozen: boolean): MintInfo => ({
  maxSupply: 100n,
  minted: 10n,
  totalSupply: 10n,
  mintPrice: 0n,
  maxPerWallet: 0,
  publicMint: true,
  baseURI: 'ipfs://bafyBase/',
  frozen,
});
const rc = (frozen: boolean, mutable = false): CollectionState => ({
  owner: 'AU1owner',
  mint: mint(frozen),
  mutable,
});
const level = (uri: string, state: CollectionState | null, image: 'ipfs' | 'web' | '' = 'ipfs') =>
  metadataStability({ uri, imageSource: image, tokenId: 7n, state }).level;

describe('metadataStability', () => {
  it("is fixed on IPFS once frozen, or with the token's own URI", () => {
    expect(level('ipfs://bafyBase/7.json', rc(true))).toBe('fixed');
    expect(level('ipfs://bafyOwn/meta.json', rc(false))).toBe('fixed');
    expect(level('ipfs://bafyBase/7.json', rc(true), '')).toBe('fixed'); // no image
  });

  it('leaves it to the owner while the base URI can move or the code can be upgraded', () => {
    expect(level('ipfs://bafyBase/7.json', rc(false))).toBe('owner');
    expect(level('ipfs://bafyBase/7.json', rc(true, true))).toBe('owner');
  });

  it('can change any time on a web server, metadata or image', () => {
    expect(level('https://nft.example/7.json', rc(true))).toBe('changeable');
    expect(level('ipfs://bafyBase/7.json', rc(true), 'web')).toBe('changeable');
  });

  it("can't tell for an imported collection", () => {
    expect(level('ipfs://bafyX/7.json', { owner: 'AU1x', mint: null, mutable: null })).toBe(
      'unknown',
    );
  });
});
