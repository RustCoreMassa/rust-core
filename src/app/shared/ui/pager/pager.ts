import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { pageList } from '../../../core/utils/pagination';

/** Page buttons under a table (‹ 1 2 … 9 ›) with the range shown ("1–10 of 95"). */
@Component({
  selector: 'app-pager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="pager" [attr.aria-label]="label()">
      <span class="muted range">{{ range() }}</span>
      @if (pages() > 1) {
        <div class="pages">
          <button
            type="button"
            class="page-btn"
            [disabled]="page() === 1"
            (click)="go.emit(page() - 1)"
            [attr.aria-label]="previousLabel()"
          >
            ‹
          </button>
          @for (p of buttons(); track $index) {
            @if (p === null) {
              <span class="gap muted">…</span>
            } @else {
              <button
                type="button"
                class="page-btn"
                [class.current]="p === page()"
                [attr.aria-current]="p === page() ? 'page' : null"
                (click)="go.emit(p)"
              >
                {{ p }}
              </button>
            }
          }
          <button
            type="button"
            class="page-btn"
            [disabled]="page() === pages()"
            (click)="go.emit(page() + 1)"
            [attr.aria-label]="nextLabel()"
          >
            ›
          </button>
        </div>
      }
    </nav>
  `,
  styles: `
    .pager {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 16px;
    }

    .range {
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }

    .pages {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .page-btn {
      min-width: 32px;
      height: 32px;
      padding: 0 8px;
      border-radius: 8px;
      border: 1px solid var(--border-strong);
      background: var(--grain), var(--surface-raised);
      box-shadow: var(--bevel);
      color: var(--gray-300);
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
    }

    .page-btn:hover:not(:disabled) {
      color: var(--white);
    }

    .page-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .page-btn.current {
      border-color: var(--ember-line);
      background: linear-gradient(180deg, rgba(255, 106, 61, 0.16), rgba(255, 106, 61, 0.06));
      color: var(--white);
    }

    .gap {
      padding: 0 2px;
    }
  `,
})
export class Pager {
  /** Pages count from 1. */
  readonly page = input.required<number>();
  readonly pages = input.required<number>();
  readonly range = input.required<string>();
  readonly label = input('Pages');
  readonly previousLabel = input('Previous page');
  readonly nextLabel = input('Next page');
  readonly go = output<number>();

  protected readonly buttons = computed(() => pageList(this.page(), this.pages()));
}
