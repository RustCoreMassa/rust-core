import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type {
  CandlestickData,
  HistogramData,
  IChartApi,
  ISeriesApi,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { formatPrice } from '../../core/dusa/dusa';
import { CHART_INTERVALS, Candle, ChartValue, candles } from '../../core/fairlaunch/chart';
import { Trade } from '../../core/fairlaunch/records';

const GREEN = '#33d17a';
const RED = '#ff2d42';
const MUTED = '#8a8a92';
const GRID = 'rgba(255, 255, 255, 0.04)';
const EDGE = 'rgba(255, 255, 255, 0.1)';
/**
 * Candle width in pixels, as trading charts keep it: about the last hour of 1-minute candles on a
 * desktop (~25 minutes on a phone), older ones by scrolling or zooming out. Fitting the whole
 * history instead would draw a young launch's first candles a hundred pixels wide.
 */
const BAR_SPACING = 10;

/**
 * Candlestick chart of a fair launch's curve, with the MAS traded per candle underneath. Built
 * from the contract's trade history; new trades are added to the last candles as they come in.
 * The chart library (TradingView Lightweight Charts, Apache-2.0) loads only with this component.
 */
@Component({
  selector: 'app-price-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <div class="chips" role="group" aria-label="Value">
        <button
          type="button"
          class="chip"
          [class.selected]="value() === 'mcap'"
          (click)="value.set('mcap')"
        >
          Market cap
        </button>
        <button
          type="button"
          class="chip"
          [class.selected]="value() === 'price'"
          (click)="value.set('price')"
        >
          Price
        </button>
      </div>
      <div class="chips" role="group" aria-label="Interval">
        @for (i of intervals; track i.seconds) {
          <button
            type="button"
            class="chip"
            [class.selected]="interval() === i.seconds"
            (click)="interval.set(i.seconds)"
          >
            {{ i.label }}
          </button>
        }
      </div>
    </div>
    <div class="frame">
      <div class="canvas" #canvas></div>
      @if (failed()) {
        <p class="overlay muted">The chart could not load. The trades are listed below.</p>
      } @else if (!trades().length) {
        <p class="overlay muted">No trades yet: the first buy draws the first candle.</p>
      }
    </div>
    <p class="unit muted">{{ value() === 'mcap' ? 'Market cap' : 'Price per token' }} in MAS</p>
  `,
  styles: `
    :host {
      display: grid;
      gap: 12px;
    }

    .bar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
    }

    .chip {
      padding: 5px 11px;
      font-size: 13px;
    }

    .frame {
      position: relative;
    }

    .canvas {
      height: 380px;
    }

    .overlay {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      margin: 0;
      padding: 16px;
      text-align: center;
      pointer-events: none;
    }

    .unit {
      margin: 0;
      font-size: 12px;
    }

    @media (max-width: 600px) {
      .canvas {
        height: 280px;
      }
    }
  `,
})
export class PriceChart {
  /** The launch's trades, oldest first; new ones are appended. */
  readonly trades = input.required<readonly Trade[]>();
  readonly virtualMas = input.required<bigint>();

  protected readonly intervals = CHART_INTERVALS;
  protected readonly interval = signal(CHART_INTERVALS[0].seconds);
  protected readonly value = signal<ChartValue>('mcap');
  protected readonly failed = signal(false);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  private readonly data = computed(() =>
    candles(this.trades(), this.virtualMas(), this.interval(), this.value()),
  );
  private readonly ready = signal(false);
  private chart: IChartApi | null = null;
  private candleSeries: ISeriesApi<'Candlestick'> | null = null;
  private volumeSeries: ISeriesApi<'Histogram'> | null = null;
  /** What is drawn: the interval and value it was drawn for, and how many candles. */
  private drawn = { key: '', count: 0 };

  constructor() {
    afterNextRender(() => void this.init());
    inject(DestroyRef).onDestroy(() => this.chart?.remove());
    effect(() => {
      const data = this.data();
      const key = `${this.interval()}:${this.value()}`;
      if (this.ready()) untracked(() => this.draw(data, key));
    });
  }

  private async init(): Promise<void> {
    try {
      const lib = await import('lightweight-charts');
      const chart = lib.createChart(this.canvas().nativeElement, {
        autoSize: true,
        layout: {
          background: { type: lib.ColorType.Solid, color: 'transparent' },
          textColor: MUTED,
          fontFamily: "'Inter Variable', system-ui, sans-serif",
          attributionLogo: true,
        },
        grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
        rightPriceScale: { borderColor: EDGE },
        timeScale: {
          borderColor: EDGE,
          timeVisible: true,
          secondsVisible: false,
          barSpacing: BAR_SPACING,
          rightOffset: 3,
          tickMarkFormatter: (time: Time, type: number) => tickMark(time as number, type),
        },
        localization: {
          locale: 'en-US',
          priceFormatter: formatPrice,
          timeFormatter: (time: Time) =>
            new Date((time as number) * 1000).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
        },
        crosshair: { mode: lib.CrosshairMode.Normal },
      });
      this.candleSeries = chart.addSeries(lib.CandlestickSeries, {
        upColor: GREEN,
        downColor: RED,
        borderVisible: false,
        wickUpColor: GREEN,
        wickDownColor: RED,
        priceFormat: { type: 'custom', formatter: formatPrice, minMove: 1e-12 },
      });
      this.candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.25 } });
      this.volumeSeries = chart.addSeries(lib.HistogramSeries, {
        priceScaleId: '',
        priceFormat: { type: 'volume' },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      this.volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      this.chart = chart;
      this.ready.set(true);
    } catch {
      this.failed.set(true);
    }
  }

  /** Redraws everything after a change of interval or value; otherwise updates the last candles. */
  private draw(data: Candle[], key: string): void {
    const candleSeries = this.candleSeries;
    const volumeSeries = this.volumeSeries;
    if (!candleSeries || !volumeSeries) return;
    if (key !== this.drawn.key || data.length < this.drawn.count) {
      candleSeries.setData(data.map(toCandle));
      volumeSeries.setData(data.map(toVolume));
      // Back to the default candle width, the newest candle at the right edge.
      const timeScale = this.chart?.timeScale();
      timeScale?.applyOptions({ barSpacing: BAR_SPACING });
      timeScale?.scrollToRealTime();
    } else {
      // The last drawn candle may have grown; anything after it is new.
      for (let i = Math.max(0, this.drawn.count - 1); i < data.length; i++) {
        candleSeries.update(toCandle(data[i]));
        volumeSeries.update(toVolume(data[i]));
      }
    }
    this.drawn = { key, count: data.length };
  }
}

function toCandle(c: Candle): CandlestickData<Time> {
  return { time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close };
}

function toVolume(c: Candle): HistogramData<Time> {
  return {
    time: c.time as UTCTimestamp,
    value: Number(c.buyMas + c.sellMas) / 1e9,
    color: c.buyMas >= c.sellMas ? 'rgba(51, 209, 122, 0.45)' : 'rgba(255, 45, 66, 0.45)',
  };
}

/** Axis labels in the viewer's time zone (the library's own are UTC). */
function tickMark(seconds: number, type: number): string {
  const d = new Date(seconds * 1000);
  switch (type) {
    case 0: // year
      return String(d.getFullYear());
    case 1: // month
      return d.toLocaleDateString('en-US', { month: 'short' });
    case 2: // day of month
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    default:
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}
