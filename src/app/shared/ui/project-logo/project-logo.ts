import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { httpUrl } from '../../../core/utils/ipfs';

/** A project's logo from its URL, or its initials when there is none or it fails to load. */
@Component({
  selector: 'app-project-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src() && !failed()) {
      <img
        [src]="src()"
        alt=""
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        (error)="failed.set(true)"
      />
    } @else {
      <span class="initials">{{ initials() }}</span>
    }
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      width: var(--logo-size, 48px);
      height: var(--logo-size, 48px);
      flex: none;
      overflow: hidden;
      border-radius: 50%;
      background: linear-gradient(
        155deg,
        rgba(255, 106, 61, 0.28),
        rgba(255, 45, 66, 0.1) 55%,
        #18181c
      );
      border: 1px solid var(--border-strong);
      box-shadow: var(--bevel);
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .initials {
      font: 700 calc(var(--logo-size, 48px) * 0.36) / 1 var(--font-display);
      color: var(--white);
    }
  `,
})
export class ProjectLogo {
  readonly url = input('');
  readonly symbol = input('');
  protected readonly failed = signal(false);
  protected readonly src = computed(() => httpUrl(this.url()));
  protected readonly initials = computed(() => this.symbol().slice(0, 2).toUpperCase());
}
