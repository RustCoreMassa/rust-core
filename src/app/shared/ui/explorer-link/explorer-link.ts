import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { explorerAddressUrl, explorerOperationUrl } from '../../../core/network/explorer';
import { NetworkStore } from '../../../core/network/network-store';
import { ShortAddressPipe } from '../../pipes/short-address-pipe';

/**
 * An address (or an operation id), short, opening the network's explorer in a new tab; plain
 * text where the network has no explorer. The full value is in the tooltip.
 */
@Component({
  selector: 'app-explorer-link',
  imports: [ShortAddressPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (url(); as href) {
      <a class="mono" [href]="href" target="_blank" rel="noopener noreferrer" [title]="title()"
        >{{ value() | shortAddress }}<span class="out" aria-hidden="true">↗</span></a
      >
    } @else {
      <span class="mono" [title]="value()">{{ value() | shortAddress }}</span>
    }
  `,
  styles: `
    :host {
      display: inline;
    }

    a {
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .out {
      margin-left: 3px;
      font-family: var(--font-body);
      font-size: 0.85em;
      opacity: 0.7;
    }
  `,
})
export class ExplorerLink {
  private readonly network = inject(NetworkStore);
  /** An address, or an operation id with `kind` 'op'. */
  readonly value = input.required<string>();
  readonly kind = input<'address' | 'op'>('address');

  protected readonly url = computed(() => {
    const explorer = this.network.config().explorerUrl;
    return this.kind() === 'op'
      ? explorerOperationUrl(explorer, this.value())
      : explorerAddressUrl(explorer, this.value());
  });
  protected readonly title = computed(() => `${this.value()} — open in the explorer`);
}
