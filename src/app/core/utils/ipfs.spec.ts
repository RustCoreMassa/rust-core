import {
  IPFS_GATEWAY,
  configureUrls,
  httpUrl,
  isLocalUrl,
  isPrivateHost,
  localGatewayOf,
} from './ipfs';

describe('httpUrl', () => {
  afterEach(() => configureUrls({ gateway: IPFS_GATEWAY, allowLocal: false }));

  it('maps ipfs links to the gateway', () => {
    expect(httpUrl('ipfs://bafyLogo/logo.png')).toBe('https://ipfs.io/ipfs/bafyLogo/logo.png');
    expect(httpUrl('ipfs://ipfs/bafyLogo')).toBe('https://ipfs.io/ipfs/bafyLogo');
  });

  it('keeps https and drops anything else', () => {
    expect(httpUrl('https://rustcore.example/a.png')).toBe('https://rustcore.example/a.png');
    expect(httpUrl('http://insecure.example/a.png')).toBe('');
    expect(httpUrl('http://localhost:8081/1.json')).toBe(''); // production default
    expect(httpUrl('javascript:alert(1)')).toBe('');
    expect(httpUrl('')).toBe('');
  });

  it('in development, loads local links and uses the configured gateway', () => {
    configureUrls({ gateway: 'http://127.0.0.1:8080/ipfs/', allowLocal: true });
    expect(httpUrl('ipfs://bafyMeta/1.json')).toBe('http://127.0.0.1:8080/ipfs/bafyMeta/1.json');
    expect(httpUrl('http://localhost:8081/1.json')).toBe('http://localhost:8081/1.json');
    expect(httpUrl('http://127.0.0.1/a.png')).toBe('http://127.0.0.1/a.png');
    expect(httpUrl('http://insecure.example/a.png')).toBe(''); // still only this machine
    expect(httpUrl('http://localhost.evil.example/a.png')).toBe('');
  });

  it('refuses ipfs paths that climb out of the gateway', () => {
    expect(httpUrl('ipfs://bafyA/../../evil')).toBe('');
    expect(httpUrl('ipfs://%2e%2e/%2E%2E/evil')).toBe('');
    expect(httpUrl('ipfs://bafyA\\..\\x')).toBe('');
    // Inside the content itself, ".." stays on the gateway: harmless.
    expect(httpUrl('ipfs://bafyA/x/../1.png')).toBe('https://ipfs.io/ipfs/bafyA/x/../1.png');
  });

  it('refuses https links to this machine or the local network', () => {
    for (const url of [
      'https://localhost/a.png',
      'https://127.0.0.1/a.png',
      'https://2130706433/a.png', // 127.0.0.1 written as a number
      'https://0x7f.1/a.png',
      'https://192.168.1.1/router',
      'https://10.0.0.5/',
      'https://172.20.0.1/',
      'https://169.254.169.254/latest',
      'https://[::1]/',
      'https://station.massa/plugin/x',
      'https://nas.local/a.png',
    ])
      expect(httpUrl(url), url).toBe('');
    expect(httpUrl('https://172.32.0.1/a.png')).toBe('https://172.32.0.1/a.png');
    expect(httpUrl('https://8.8.8.8/a.png')).toBe('https://8.8.8.8/a.png');
    expect(httpUrl('https://massa.network/a.png')).toBe('https://massa.network/a.png');
  });

  it('refuses a gateway without the final slash', () => {
    expect(() => configureUrls({ gateway: 'http://127.0.0.1:8080/ipfs' })).toThrow();
  });
});

describe('isPrivateHost', () => {
  it('knows private and local hosts', () => {
    for (const host of [
      'localhost',
      'a.localhost',
      'x.internal',
      'deweb.massa',
      '100.64.0.1',
      '224.0.0.1',
    ])
      expect(isPrivateHost(host), host).toBe(true);
    for (const host of ['example.com', '100.128.0.1', '11.0.0.1', 'massa.net'])
      expect(isPrivateHost(host), host).toBe(false);
  });
});

describe('isLocalUrl', () => {
  it('knows this machine', () => {
    for (const url of [
      'http://localhost',
      'http://localhost:4200/x',
      'http://127.0.0.1:8080/ipfs/',
      'http://[::1]:3000/',
    ])
      expect(isLocalUrl(url)).toBe(true);
    for (const url of [
      'http://localhost.example.com/',
      'http://127.0.0.1.example.com/',
      'http://10.0.0.2/',
      'ftp://localhost/',
    ])
      expect(isLocalUrl(url)).toBe(false);
  });
});

describe('localGatewayOf', () => {
  afterEach(() => configureUrls({ gateway: IPFS_GATEWAY, allowLocal: false }));

  it('finds the local node a link came from, only while developing', () => {
    const url = 'http://127.0.0.1:8090/ipfs/bafyMeta/1.json';
    expect(localGatewayOf(url)).toBeNull();
    configureUrls({ allowLocal: true });
    expect(localGatewayOf(url)).toBe('http://127.0.0.1:8090/ipfs/');
    expect(localGatewayOf('http://localhost:8081/meta/1.json')).toBeNull(); // not a gateway
    expect(localGatewayOf('https://ipfs.io/ipfs/bafyMeta/1.json')).toBeNull(); // not local
    expect(httpUrl('ipfs://bafyImg/1.png', 'http://127.0.0.1:8090/ipfs/')).toBe(
      'http://127.0.0.1:8090/ipfs/bafyImg/1.png',
    );
  });
});
