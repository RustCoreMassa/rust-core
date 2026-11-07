import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

/** Shown once the page is scrolled this far (px). */
const SHOW_AFTER = 600;

/** A round button in the bottom-right corner that scrolls back to the top of a long page. */
@Component({
  selector: 'app-back-to-top',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:scroll)': 'onScroll()' },
  template: `
    @if (visible()) {
      <button type="button" class="top" aria-label="Back to top" title="Back to top" (click)="up()">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M12 19V5M5 12l7-7 7 7"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    }
  `,
  styles: `
    .top {
      position: fixed;
      right: max(16px, env(safe-area-inset-right));
      bottom: max(16px, env(safe-area-inset-bottom));
      z-index: 40;
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      padding: 0;
      border-radius: 50%;
      border: 1px solid var(--border-strong);
      background: var(--grain), var(--surface-raised);
      color: var(--white);
      box-shadow: var(--bevel), var(--shadow-md);
      cursor: pointer;
      animation: appear 0.2s var(--ease-out);
      transition:
        border-color 0.2s ease,
        transform 0.2s var(--ease-out);
    }

    .top:hover {
      border-color: var(--ember-line);
      transform: translateY(-2px);
    }

    .top:focus-visible {
      outline: none;
      box-shadow: var(--ring);
    }

    @keyframes appear {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }

    @media (max-width: 640px) {
      .top {
        width: 42px;
        height: 42px;
      }
    }
  `,
})
export class BackToTop {
  protected readonly visible = signal(false);

  protected onScroll(): void {
    this.visible.set(window.scrollY > SHOW_AFTER);
  }

  protected up(): void {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    // Keyboard users continue from the top of the page, not from the button that disappears.
    document.getElementById('main')?.focus({ preventScroll: true });
  }
}
