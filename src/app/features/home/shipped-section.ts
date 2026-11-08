import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Icon } from '../../shared/ui/icon/icon';
import { MILESTONES } from './home-content';

/** Milestones shown before "See all". */
const LATEST = 10;

/**
 * What shipped, newest first, along one ember line: milestones alternate right and left, each a
 * ring on the line (landmarks a larger one with an icon), and the line runs into "See all".
 */
@Component({
  selector: 'app-shipped-section',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="container section" id="built" aria-labelledby="built-title">
      <div class="section-head">
        <span class="label">What we've built</span>
        <h2 id="built-title">Shipped so far</h2>
        <p>Every release built in public, from its tagged source.</p>
      </div>

      <div class="track" [class.done]="!hasMore()">
        <ol class="milestones">
          @for (m of shown(); track m.title; let i = $index) {
            <li [class.left]="i % 2 === 1" [title]="m.text">
              <span class="ring" [class.major]="m.major" aria-hidden="true">
                @if (m.major; as major) {
                  @if (major.icon === 'logo') {
                    <img src="assets/logo-mark.svg" alt="" />
                  } @else {
                    <app-icon [name]="major.icon" />
                  }
                }
              </span>
              <div class="entry">
                <strong>{{ m.title }}</strong>
                <span class="date">({{ m.date }})</span>
                @if (m.major; as major) {
                  <span class="badge">{{ major.label }}</span>
                }
              </div>
            </li>
          }
        </ol>
        @if (hasMore()) {
          <div class="more">
            <button class="see-all" type="button" (click)="all.set(true)">See all</button>
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    /* ---- the line ---- */
    .track {
      --node: 22px;
      --rail: 2px;
      position: relative;
      max-width: 860px;
      margin: 0 auto;
    }

    .milestones {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    /* Ring in the middle column; the entry right of it, or left of it on every second row. */
    li {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 80px minmax(0, 1fr);
      align-items: start;
      padding-bottom: 46px;
    }

    /* The line, one segment per milestone: from its ring to the next one (or into the button). */
    li::before {
      content: '';
      position: absolute;
      left: 50%;
      width: var(--rail);
      margin-left: calc(var(--rail) / -2);
      background: var(--ember);
      box-shadow: 0 0 10px var(--ember-glow);
    }

    li::before {
      top: 11px;
      bottom: -11px;
    }

    li:last-child::before {
      bottom: 0;
    }

    .track.done li:last-child::before {
      display: none;
    }

    .ring {
      position: relative;
      z-index: 1;
      grid-column: 2;
      grid-row: 1;
      justify-self: center;
      display: grid;
      place-items: center;
      width: var(--node);
      height: var(--node);
      border-radius: 50%;
      border: 2px solid var(--ember);
      background: var(--bg);
      box-shadow: 0 0 12px var(--ember-glow);
    }

    /* A landmark: a larger ring with an icon, centred on the title's line too. */
    .ring.major {
      width: 44px;
      height: 44px;
      margin-top: -11px;
      color: var(--ember);
      background: radial-gradient(circle, rgba(255, 90, 54, 0.16), transparent 70%), var(--bg);
      box-shadow:
        0 0 0 6px rgba(255, 90, 54, 0.08),
        0 0 22px var(--ember-glow);
    }

    /* The icon is app-icon's own svg, beyond this component's style scope. */
    :host ::ng-deep .ring.major svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .ring.major img {
      width: 22px;
      height: auto;
    }

    .entry {
      grid-column: 3;
      grid-row: 1;
      display: grid;
      justify-items: start;
      gap: 4px;
      padding-left: 18px;
    }

    li.left .entry {
      grid-column: 1;
      justify-items: end;
      padding: 0 18px 0 0;
      text-align: right;
    }

    strong {
      font: 700 16px/1.35 var(--font-display);
      letter-spacing: 0.05em;
    }

    .date {
      color: var(--gray-500);
      font-size: 15px;
      font-weight: 300;
      letter-spacing: 0.06em;
    }

    .badge {
      margin-top: 2px;
      color: var(--gray-300);
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    /* ---- "See all": an outlined pill the line ends on ---- */
    .more {
      position: relative;
      display: flex;
      justify-content: center;
    }

    .see-all {
      position: relative;
      min-width: 280px;
      height: 60px;
      padding: 0 40px;
      border-radius: 999px;
      border: 1.5px solid var(--ember);
      background: var(--bg);
      color: var(--gray-300);
      font: 500 15px/1 var(--font-body);
      letter-spacing: 0.32em;
      text-transform: uppercase;
      cursor: pointer;
      transition:
        color 0.2s ease,
        box-shadow 0.25s ease,
        background 0.25s ease;
    }

    .see-all:hover {
      color: var(--white);
      background: rgba(255, 90, 54, 0.08);
      box-shadow: 0 0 24px -4px var(--ember-glow);
    }

    /* Narrow screens: the line on the left, every entry to its right. */
    @media (max-width: 720px) {
      li::before {
        left: 28px;
      }

      .track:not(.done) li:last-child::before {
        background: linear-gradient(180deg, var(--ember), transparent);
      }

      .more {
        margin-top: 8px;
      }

      li,
      li.left {
        grid-template-columns: 56px minmax(0, 1fr);
      }

      .ring {
        grid-column: 1;
      }

      .entry,
      li.left .entry {
        grid-column: 2;
        justify-items: start;
        padding: 0 0 0 10px;
        text-align: left;
      }

      .see-all {
        min-width: 0;
        width: 100%;
      }
    }
  `,
})
export class ShippedSection {
  protected readonly all = signal(false);
  protected readonly shown = computed(() =>
    this.all() ? MILESTONES : MILESTONES.slice(0, LATEST),
  );
  protected readonly hasMore = computed(() => !this.all() && MILESTONES.length > LATEST);
}
