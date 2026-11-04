/** Public gateway used to show ipfs:// images and metadata (listed in the README's destinations). */
export const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

export interface UrlSettings {
  /** Gateway for ipfs:// links, ending with /ipfs/. */
  gateway: string;
  /** Also accept http(s) links on this machine — development only (environment.development.ts). */
  allowLocal: boolean;
}

const settings: UrlSettings = { gateway: IPFS_GATEWAY, allowLocal: false };

/** Set once at startup from the environment (main.ts); tests may change it and reset it. */
export function configureUrls(next: Partial<UrlSettings>): void {
  if (next.gateway !== undefined) {
    if (!/^https?:\/\/\S+\/$/.test(next.gateway)) throw new Error('The gateway must end with "/"');
    settings.gateway = next.gateway;
  }
  if (next.allowLocal !== undefined) settings.allowLocal = next.allowLocal;
}

export function allowsLocalUrls(): boolean {
  return settings.allowLocal;
}

/**
 * http(s)://localhost, 127.0.0.1 or [::1], then a port, a path or nothing — the same hosts the
 * Launchpad contract accepts over http (rules.ts isLocalHttp).
 */
export function isLocalUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/.test(url);
}

/**
 * The gateway part of a local gateway link while developing
 * (`http://127.0.0.1:8090/ipfs/bafy…/1.json` → `http://127.0.0.1:8090/ipfs/`); null otherwise.
 * Metadata read from a local IPFS node resolves its own ipfs:// links through that node: what it
 * links to is usually pinned only there.
 */
export function localGatewayOf(url: string): string | null {
  if (!settings.allowLocal || !isLocalUrl(url)) return null;
  const at = url.indexOf('/ipfs/');
  return at < 0 ? null : url.slice(0, at + '/ipfs/'.length);
}

/**
 * A host a public link must not point at: this machine, the local network, or a `.massa` name
 * (resolved by Massa Station on the user's own computer). Creators' links load in every
 * visitor's browser, so these would make it call services on the visitor's machine or network.
 * `host` as the URL parser gives it (lowercase, IPv4 normalized, IPv6 in brackets).
 */
export function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || /\.(localhost|local|internal|massa)$/.test(host)) return true;
  if (host.startsWith('[')) return true; // IPv6 literals: no public content uses them
  const ip = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!ip) return false;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b < 128) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b < 32) ||
    (a === 192 && b === 168)
  );
}

/**
 * A link the browser can load: ipfs://CID/path → gateway URL (`gateway`, else the configured
 * one), refused if its path climbs out of the gateway (`..`); https stays, unless it points at
 * a private host; a local link stays only when local URLs are allowed (development);
 * anything else → ''.
 */
export function httpUrl(url: string, gateway: string = settings.gateway): string {
  if (url.startsWith('ipfs://')) {
    const mapped = gateway + url.slice('ipfs://'.length).replace(/^ipfs\//, '');
    const parsed = parse(mapped);
    return parsed && parsed.href.startsWith(gateway) && !mapped.includes('\\') ? mapped : '';
  }
  if (settings.allowLocal && isLocalUrl(url)) return url;
  if (url.startsWith('https://')) {
    const parsed = parse(url);
    return parsed && !isPrivateHost(parsed.hostname) ? url : '';
  }
  return '';
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
