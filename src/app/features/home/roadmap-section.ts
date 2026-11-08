import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/ui/icon/icon';
import { ROADMAP, RoadmapStatus } from './home-content';

/** The roadmap: one card per track, its items ticked as they ship. */
@Component({
  selector: 'app-roadmap-section',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
export class RoadmapSection {
  protected readonly roadmap = ROADMAP;

  protected statusKey(status: RoadmapStatus): string {
    return status === 'In progress' ? 'progress' : status.toLowerCase();
  }
}
