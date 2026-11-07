import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Icon } from '../../shared/ui/icon/icon';
import { MILESTONES, ROADMAP, RoadmapStatus } from './home-content';

/** Milestones shown before "Show the full history". */
const FIRST = 6;

/** What shipped (a lit timeline, newest first) and the roadmap. */
@Component({
  selector: 'app-story-section',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="container section" id="built" aria-labelledby="built-title">
      <div class="section-head">
        <span class="label">What we've built</span>
        <h2 id="built-title">Shipped so far</h2>
      </div>
      <ol class="timeline">
        @for (m of shown(); track m.title) {
          <li>
            <span class="node" aria-hidden="true"></span>
            <div class="card entry">
              <div class="meta">
                <span class="date">{{ m.date }}</span>
                <span class="product" [attr.data-product]="m.product">{{ m.product }}</span>
              </div>
              <h3>{{ m.title }}</h3>
              <p>{{ m.text }}</p>
            </div>
          </li>
        }
      </ol>
      @if (milestones.length > first) {
        <div class="more">
          <button class="btn btn-ghost" type="button" (click)="all.set(!all())">
            {{
              all() ? 'Show the latest only' : 'Show the full history (' + milestones.length + ')'
            }}
          </button>
        </div>
      }
    </section>

    <section class="container section" id="roadmap" aria-labelledby="roadmap-title">
      <div class="section-head">
        <span class="label">What's next</span>
        <h2 id="roadmap-title">Roadmap</h2>
        <p>Where RustCore is heading. Dates follow quality, not the other way round.</p>
      </div>
      <div class="tracks">
        @for (track of roadmap; track track.tag) {
          <article class="card track" [class.live]="track.status === 'Live'">
            <div class="track-head">
              <span class="tag">{{ track.tag }}</span>
              <span class="status" [attr.data-status]="statusKey(track.status)">
                <span class="dot"></span>{{ track.status }}
              </span>
            </div>
            <h3>{{ track.title }}</h3>
            <div class="segments" aria-hidden="true">
              @for (item of track.items; track item.text) {
                <i [class.on]="item.done"></i>
              }
            </div>
            <ul>
              @for (item of track.items; track item.text) {
                <li [class.done]="item.done">
                  <span class="tick" [class.tick-off]="!item.done">
                    @if (item.done) {
                      <app-icon name="check" />
                    }
                  </span>
                  {{ item.text }}
                  <span class="visually-hidden">{{ item.done ? '(done)' : '(to do)' }}</span>
                </li>
              }
            </ul>
          </article>
        }
      </div>
    </section>
  `,
  styles: `
    /* ---- timeline: a lit wire with an ember node per milestone ---- */
    .timeline {
      position: relative;
      max-width: 780px;
      margin: 0 auto;
      padding: 0;
      list-style: none;
    }

    .timeline::before {
      content: '';
      position: absolute;
      top: 14px;
      bottom: 14px;
      left: 5px;
      width: 2px;
      border-radius: 2px;
      background: linear-gradient(
        180deg,
        var(--ember) 0%,
        rgba(255, 106, 61, 0.25) 60%,
        rgba(255, 255, 255, 0.05) 100%
      );
      box-shadow: 0 0 10px rgba(255, 90, 54, 0.4);
    }

    .timeline li {
      position: relative;
      padding: 0 0 16px 40px;
    }

    .timeline .node {
      position: absolute;
      top: 24px;
      left: 0;
    }

    /* The short wire from the node to its card. */
    .timeline li::before {
      content: '';
      position: absolute;
      top: 29px;
      left: 12px;
      width: 28px;
      height: 2px;
      background: linear-gradient(90deg, var(--ember), rgba(255, 106, 61, 0.1));
    }

    .entry {
      padding: 18px 22px;
    }

    .meta {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .date {
      color: var(--gray-500);
      font-size: 13px;
      font-weight: 600;
    }

    .product {
      padding: 2px 9px;
      border-radius: 999px;
      border: 1px solid var(--border-strong);
      color: var(--gray-300);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .product[data-product='Launchpad'] {
      border-color: var(--ember-line);
      color: var(--ember-text);
    }

    .entry h3 {
      margin-top: 10px;
      font-size: 18px;
    }

    .entry p {
      margin: 8px 0 0;
      color: var(--gray-500);
      font-size: 14px;
    }

    .more {
      display: flex;
      justify-content: center;
      margin-top: 20px;
    }

    /* ---- roadmap ---- */
    .tracks {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }

    .track {
      display: grid;
      align-content: start;
      gap: 14px;
    }

    .track.live {
      border-color: rgba(255, 106, 61, 0.22);
    }

    .track-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .tag {
      color: var(--gray-500);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--bg-sunken);
      box-shadow: var(--sunken);
      color: var(--gray-300);
      font-size: 12px;
      font-weight: 600;
    }

    .status[data-status='progress'] .dot {
      background: var(--ember);
      box-shadow: 0 0 10px var(--ember-glow);
    }

    .status[data-status='planned'] .dot,
    .status[data-status='exploring'] .dot {
      background: var(--gray-500);
      box-shadow: none;
    }

    .track h3 {
      font-size: 20px;
    }

    .track ul {
      display: grid;
      gap: 10px;
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
    }

    .track li {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      color: var(--gray-500);
      font-size: 14px;
    }

    .track li.done {
      color: var(--gray-300);
    }

    .track .tick {
      width: 18px;
      height: 18px;
      margin-top: 1px;
    }

    @media (max-width: 1020px) {
      .tracks {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 640px) {
      .tracks {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class StorySection {
  protected readonly milestones = MILESTONES;
  protected readonly roadmap = ROADMAP;
  protected readonly first = FIRST;
  protected readonly all = signal(false);
  protected readonly shown = computed(() =>
    this.all() ? this.milestones : this.milestones.slice(0, FIRST),
  );

  protected statusKey(status: RoadmapStatus): string {
    return status === 'In progress' ? 'progress' : status.toLowerCase();
  }
}
