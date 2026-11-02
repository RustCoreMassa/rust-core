import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IndexerApi, IndexerStatus } from '../../core/indexer/indexer-api';
import { NETWORKS } from '../../core/network/networks';
import { API_GROUPS } from './api-reference';

/** The public RustCore API: how to call it, its rules and every endpoint. */
@Component({
  selector: 'app-api-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './api-page.html',
  styleUrl: './api-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiPage {
  private readonly api = inject(IndexerApi);

  /** The public API serves mainnet. */
  protected readonly origin = NETWORKS.mainnet.apiUrl ?? '';
  protected readonly baseUrl = `${this.origin}/api/v1`;
  protected readonly groups = API_GROUPS;
  /** undefined while asking, null when it can't be used now. */
  protected readonly status = signal<IndexerStatus | null | undefined>(undefined);
  protected readonly copied = signal(false);

  protected readonly pageExample = `{
  "items": [ … ],
  "nextCursor": "MjAyNi0xMC0xOVQwOTo1OToyOVoKNg"
}`;
  protected readonly errorExample = `{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "limit: must be between 1 and 200",
  "instance": "/api/v1/projects"
}`;
  protected readonly fetchExample = `// Every NFT of a collection, page by page.
async function allItems(collection) {
  const items = [];
  let cursor = null;
  do {
    const url = new URL(\`${this.baseUrl}/collections/\${collection}/items\`);
    url.searchParams.set('limit', '200');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url);
    if (!res.ok) throw new Error((await res.json()).detail);
    const page = await res.json();
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}`;

  constructor() {
    void this.api.ready('mainnet').then((status) => this.status.set(status));
  }

  protected async copyBase(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.baseUrl);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // No clipboard access: the URL stays visible to select by hand.
    }
  }
}
