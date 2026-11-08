import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'token'
  | 'collection'
  | 'market'
  | 'presale'
  | 'wallet'
  | 'api'
  | 'plus'
  | 'lock'
  | 'code'
  | 'cube'
  | 'globe'
  | 'form'
  | 'sign'
  | 'crown'
  | 'check'
  | 'shield'
  | 'eye'
  | 'clock'
  | 'flag';

/**
 * A line icon (24 × 24, stroked with currentColor). Size and stroke come from the parent:
 * `.icon-tile svg`, `.btn svg`, or the host's own CSS.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 24 24">
      @switch (name()) {
        @case ('token') {
          <circle cx="12" cy="12" r="8.5" />
          <path
            d="M12 7.5v9M9.5 9.5c0-1 1.1-1.8 2.5-1.8s2.5.8 2.5 1.8-1.1 1.7-2.5 1.9-2.5.9-2.5 1.9 1.1 1.9 2.5 1.9 2.5-.8 2.5-1.8"
          />
        }
        @case ('collection') {
          <rect x="3.5" y="5" width="13" height="13" rx="2.5" />
          <path d="M7.5 3h10a3 3 0 0 1 3 3v10" />
          <path d="M3.5 15l3.6-3.6a1.5 1.5 0 0 1 2.1 0L13 15.2" />
          <circle cx="12.3" cy="9" r="1.3" />
        }
        @case ('market') {
          <path
            d="M3.5 12.4V5A1.5 1.5 0 0 1 5 3.5h7.4l8.1 8.1a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0z"
          />
          <circle cx="8.2" cy="8.2" r="1.4" />
        }
        @case ('presale') {
          <path d="M4 19.5h16" />
          <path d="M6 16l4-4.5 3 2.5 5-6" />
          <path d="M14.5 8H18v3.5" />
        }
        @case ('wallet') {
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17v3" />
          <rect x="4" y="8" width="16" height="11" rx="2.5" />
          <path d="M15.5 13.5h1.5" />
        }
        @case ('api') {
          <path
            d="M8 6c-2 0-2.5 1-2.5 2.5v1.8c0 .9-.6 1.7-1.5 1.7.9 0 1.5.8 1.5 1.7v1.8C5.5 17 6 18 8 18"
          />
          <path
            d="M16 6c2 0 2.5 1 2.5 2.5v1.8c0 .9.6 1.7 1.5 1.7-.9 0-1.5.8-1.5 1.7v1.8c0 1.5-.5 2.5-2.5 2.5"
          />
          <path d="M10 12h.01M14 12h.01" />
        }
        @case ('plus') {
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke-dasharray="3 3" />
          <path d="M12 8.5v7M8.5 12h7" />
        }
        @case ('lock') {
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        }
        @case ('code') {
          <path d="M9 18l-6-6 6-6M15 6l6 6-6 6" />
        }
        @case ('cube') {
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        }
        @case ('globe') {
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        }
        @case ('form') {
          <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
          <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
        }
        @case ('sign') {
          <path d="M4 20h4.5L19 9.5a2.1 2.1 0 0 0-3-3L5.5 17 4 20z" />
          <path d="M14.5 8l3 3" />
        }
        @case ('crown') {
          <path d="M4 17.5L3 7.5l5 4 4-6 4 6 5-4-1 10z" />
          <path d="M5 20.5h14" />
        }
        @case ('check') {
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        }
        @case ('shield') {
          <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z" />
          <path d="M9 12l2.2 2.2L15.5 10" />
        }
        @case ('eye') {
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="3" />
        }
        @case ('clock') {
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        }
        @case ('flag') {
          <path d="M5 21V4" />
          <path d="M5 4.5h11l-2 4 2 4H5" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
}
