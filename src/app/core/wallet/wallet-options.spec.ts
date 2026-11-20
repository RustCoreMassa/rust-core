import { LINKS } from '../links';
import { rustCoreInstallUrl } from './wallet-options';

describe('rustCoreInstallUrl', () => {
  it('sends Firefox, on computers and Android, to Firefox Add-ons', () => {
    const desktop =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0';
    const android = 'Mozilla/5.0 (Android 15; Mobile; rv:145.0) Gecko/145.0 Firefox/145.0';
    expect(rustCoreInstallUrl(desktop)).toBe(LINKS.walletFirefox);
    expect(rustCoreInstallUrl(android)).toBe(LINKS.walletFirefox);
  });

  it('sends every other browser to the Chrome Web Store', () => {
    const chrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
    expect(rustCoreInstallUrl(chrome)).toBe(LINKS.walletChrome);
    expect(rustCoreInstallUrl('')).toBe(LINKS.walletChrome);
  });
});
