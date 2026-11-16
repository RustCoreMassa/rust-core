import { explorerAddressUrl, explorerOperationUrl } from './explorer';
import { NETWORKS } from './networks';

describe('explorer links', () => {
  const explorer = NETWORKS.mainnet.explorerUrl;

  it('opens addresses and operations on the mainnet explorer', () => {
    expect(explorerAddressUrl(explorer, 'AS1abc')).toBe(
      'https://explorer.massa.net/address/AS1abc',
    );
    expect(explorerOperationUrl(explorer, 'O1xyz')).toBe('https://explorer.massa.net/op/O1xyz');
  });

  it('has none where the network has no explorer, or for nothing', () => {
    expect(NETWORKS.buildnet.explorerUrl).toBeNull();
    expect(explorerAddressUrl(null, 'AS1abc')).toBeNull();
    expect(explorerOperationUrl(explorer, '')).toBeNull();
  });
});
