'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { axisPoints, carryPrice, toMoscowUnix } from '@/lib/chart-series';
import { downloadXls, formatCabinetTs, formatRuInt } from '@/lib/export-xls';
import { addDays, formatDayRu } from '@/lib/range-load';
import type { ClGroup, LoadProgress, SeriesPoint } from '@/lib/types';
import { readToken } from '@/lib/host-tokens';
import { eyebrow, hint, secondaryBtn, title } from './styles';

export type ChartKind = 'long-short' | 'persons' | 'oi' | 'directed';

type AxisPoint = { time: number; ts: string };

type HoverTip = {
  x: number;
  y: number;
  ts: string;
  items: Array<{ color: string; label: string; value: number }>;
};

function pick(point: SeriesPoint, group: ClGroup, kind: ChartKind): number[] {
  const g = group === 'FIZ' ? point.fiz : point.yur;
  if (kind === 'long-short') return [g.posLong, g.posShort];
  if (kind === 'persons') return [g.posLongNum, g.posShortNum];
  if (kind === 'oi') return [g.openInterest];
  return [g.directed];
}

function heading(kind: ChartKind, group: ClGroup): string {
  const who = group === 'FIZ' ? 'Физические лица' : 'Юридические лица';
  const what =
    kind === 'long-short'
      ? 'Длинные / короткие'
      : kind === 'persons'
        ? 'Количество лиц'
        : kind === 'oi'
          ? 'Открытый интерес'
          : 'Направленная позиция';
  return `${what} · ${who}`;
}

function uniquePoints(points: SeriesPoint[]): SeriesPoint[] {
  const seen = new Set<number>();
  return [...points]
    .sort((a, b) => toMoscowUnix(a.ts) - toMoscowUnix(b.ts))
    .filter((p) => {
      const t = toMoscowUnix(p.ts);
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });
}

function lookupTs(time: number, axis: AxisPoint[]): string | null {
  if (!axis.length) return null;
  let lo = 0;
  let hi = axis.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (axis[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  const a = axis[lo];
  const b = axis[Math.max(0, lo - 1)];
  return Math.abs(a.time - time) <= Math.abs(b.time - time) ? a.ts : b.ts;
}

function lookupRow(ts: string, rows: Map<string, SeriesPoint>): SeriesPoint | null {
  return rows.get(ts) ?? null;
}

const LONG = '#12A36A';
const SHORT = '#D64545';
const OI = '#5B7CFF';
const DIR = '#D4A017';
const PRICE = '#8B95A8';

function legendItems(kind: ChartKind): Array<{ color: string; label: string }> {
  const price = { color: PRICE, label: 'Цена контракта' };
  if (kind === 'long-short') return [price, { color: LONG, label: 'Длинные позиции' }, { color: SHORT, label: 'Короткие позиции' }];
  if (kind === 'persons') return [price, { color: LONG, label: 'Лица в лонг' }, { color: SHORT, label: 'Лица в шорт' }];
  if (kind === 'oi') return [price, { color: OI, label: 'Открытый интерес' }];
  return [price, { color: DIR, label: 'Направленная позиция' }];
}

function tipItems(kind: ChartKind, group: ClGroup, row: SeriesPoint): Array<{ color: string; label: string; value: number }> {
  const values = pick(row, group, kind);
  const items = legendItems(kind).filter((item) => item.label !== 'Цена контракта');
  const out = items.map((item, i) => ({ color: item.color, label: item.label, value: values[i] ?? 0 }));
  if (row.price != null) out.push({ color: PRICE, label: 'Цена контракта', value: row.price });
  return out;
}

function exportHeaders(kind: ChartKind): string[] {
  const common = ['Время', 'Цена контракта'];
  if (kind === 'long-short') return [...common, 'Длинные позиции', 'Короткие позиции'];
  if (kind === 'persons') return [...common, 'Лица в лонг', 'Лица в шорт'];
  if (kind === 'oi') return [...common, 'Открытый интерес'];
  return [...common, 'Направленная позиция'];
}

export function FutoiChart({
  kind,
  group,
  points,
  stale,
  secid,
  loadingDays,
  progress,
  focusDate,
  onVisibleRange,
  onNeedOlder,
}: {
  kind: ChartKind;
  group: ClGroup;
  points: SeriesPoint[];
  stale?: boolean;
  secid?: string;
  loadingDays?: string[];
  progress?: LoadProgress;
  focusDate?: string;
  onVisibleRange?: (from: string, to: string) => void;
  onNeedOlder?: (date: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<ISeriesApi<'Line'> | null>(null);
  const aRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bRef = useRef<ISeriesApi<'Line'> | null>(null);
  const axisRef = useRef<AxisPoint[]>([]);
  const rowsRef = useRef<SeriesPoint[]>([]);
  const rowByTsRef = useRef(new Map<string, SeriesPoint>());
  const fittedFor = useRef<string>('');
  const rangeTimer = useRef<number>(0);
  const onRangeRef = useRef(onVisibleRange);
  const onOlderRef = useRef(onNeedOlder);
  const firstDayRef = useRef<string>('');
  const focusedRef = useRef<string>('');
  const kindRef = useRef(kind);
  const groupRef = useRef(group);
  onRangeRef.current = onVisibleRange;
  onOlderRef.current = onNeedOlder;
  kindRef.current = kind;
  groupRef.current = group;

  const [tip, setTip] = useState<HoverTip | null>(null);

  const mainColor = kind === 'oi' ? OI : kind === 'directed' ? DIR : LONG;
  const needB = kind === 'long-short' || kind === 'persons';

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const bg = readToken(el, '--color-background', 'transparent');
    const muted = readToken(el, '--color-muted-foreground', '#888888');
    const line = readToken(el, '--color-border', '#cccccc');
    const sunken = readToken(el, '--color-muted', '#eeeeee');
    const font = readToken(el, '--font-family', 'system-ui, sans-serif');
    const chart = createChart(el, {
      width: Math.max(el.clientWidth, 320),
      height: 220,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: muted,
        fontFamily: font,
      },
      grid: {
        vertLines: { color: sunken },
        horzLines: { color: sunken },
      },
      rightPriceScale: { borderColor: line },
      leftPriceScale: { visible: true, borderColor: line },
      timeScale: {
        borderColor: line,
        rightOffset: 6,
        minBarSpacing: 3,
        fixLeftEdge: false,
        fixRightEdge: false,
        tickMarkFormatter: (time: number) => {
          const ts = lookupTs(Number(time), axisRef.current);
          return ts ? ts.slice(11, 16) : '';
        },
      },
      localization: {
        timeFormatter: (time: number) => {
          const ts = lookupTs(Number(time), axisRef.current);
          return ts ? formatCabinetTs(ts) : '';
        },
        priceFormatter: (price: number) => formatRuInt(price),
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      crosshair: {
        mode: 0,
        vertLine: { color: muted, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
    });
    chartRef.current = chart;
    priceRef.current = chart.addSeries(LineSeries, {
      color: PRICE,
      lineWidth: 1,
      priceScaleId: 'left',
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    });
    aRef.current = chart.addSeries(LineSeries, {
      color: mainColor,
      lineWidth: 2,
      priceScaleId: 'right',
      lastValueVisible: false,
      priceFormat: { type: 'volume', precision: 0 },
    });
    bRef.current = needB
      ? chart.addSeries(LineSeries, {
          color: SHORT,
          lineWidth: 2,
          priceScaleId: 'right',
          priceLineVisible: false,
          lastValueVisible: false,
          priceFormat: { type: 'volume', precision: 0 },
        })
      : null;

    const emitRange = () => {
      const range = chart.timeScale().getVisibleRange();
      if (!range || typeof range.from !== 'number' || typeof range.to !== 'number') return;
      const fromTs = lookupTs(range.from, axisRef.current);
      const toTs = lookupTs(range.to, axisRef.current);
      if (fromTs && toTs) onRangeRef.current?.(fromTs.slice(0, 10), toTs.slice(0, 10));
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      window.clearTimeout(rangeTimer.current);
      rangeTimer.current = window.setTimeout(emitRange, 180);
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange((logical) => {
      if (!logical || logical.from >= 20) return;
      const first = firstDayRef.current;
      if (!first) return;
      onOlderRef.current?.(addDays(first, -1));
    });
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.time == null) {
        setTip(null);
        return;
      }
      const ts = lookupTs(Number(param.time), axisRef.current);
      const row = ts ? lookupRow(ts, rowByTsRef.current) : null;
      if (!ts || !row) {
        setTip(null);
        return;
      }
      const box = el.getBoundingClientRect();
      setTip({
        x: Math.min(Math.max(param.point.x + 12, 8), Math.max(8, box.width - 220)),
        y: Math.min(Math.max(param.point.y + 12, 8), Math.max(8, box.height - 110)),
        ts,
        items: tipItems(kindRef.current, groupRef.current, row),
      });
    });

    const ro = new ResizeObserver(() => {
      if (!el.clientWidth) return;
      chart.applyOptions({ width: el.clientWidth, height: 220 });
    });
    ro.observe(el);

    return () => {
      window.clearTimeout(rangeTimer.current);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      priceRef.current = null;
      aRef.current = null;
      bRef.current = null;
    };
  }, [kind, group, mainColor, needB]);

  useEffect(() => {
    const rows = carryPrice(uniquePoints(points));
    const axis: AxisPoint[] = axisPoints(rows);
    axisRef.current = axis;
    rowsRef.current = rows;
    rowByTsRef.current = new Map(rows.map((row) => [row.ts, row]));
    if (!aRef.current) return;
    const toPoint = (take: (p: SeriesPoint) => number | null) =>
      rows
        .map((p, i) => {
          const value = take(p);
          if (value == null || !Number.isFinite(value)) return null;
          return { time: axis[i].time as UTCTimestamp, value };
        })
        .filter((p): p is { time: UTCTimestamp; value: number } => p != null);

    priceRef.current?.setData(toPoint((p) => p.price));
    aRef.current.setData(toPoint((p) => pick(p, group, kind)[0] ?? null));
    bRef.current?.setData(toPoint((p) => pick(p, group, kind)[1] ?? null));

    firstDayRef.current = rows[0]?.ts.slice(0, 10) ?? '';
    const fitKey = secid ?? kind;
    if (rows.length && fittedFor.current !== fitKey) {
      chartRef.current?.timeScale().fitContent();
      fittedFor.current = fitKey;
      focusedRef.current = '';
    }
    if (focusDate && focusDate !== focusedRef.current) {
      const day = axis.filter((a) => a.ts.startsWith(focusDate));
      if (day.length) {
        chartRef.current?.timeScale().setVisibleRange({
          from: day[0].time as UTCTimestamp,
          to: day.at(-1)!.time as UTCTimestamp,
        });
        focusedRef.current = focusDate;
      }
    }
  }, [points, kind, group, secid, focusDate]);

  const last = points.at(-1)?.ts ?? '';
  const pending = loadingDays ?? [];
  const loadLabel =
    progress && progress.total > progress.done
      ? `${progress.current ? `Догружаю ${formatDayRu(progress.current)}` : 'Догружаю'} · ${progress.done}/${progress.total} · ~${progress.etaSec} с`
      : pending.length
        ? `Догружаю ${formatDayRu(pending[0])}`
        : null;

  const exportChart = () => {
    const rows = rowsRef.current;
    if (!rows.length) return;
    const headers = exportHeaders(kind);
    const data = rows.map((row) => {
      const values = pick(row, group, kind);
      return [formatCabinetTs(row.ts), row.price ?? '', ...values];
    });
    const who = group === 'FIZ' ? 'fiz' : 'yur';
    downloadXls(`futoi-${secid ?? 'Si'}-${kind}-${who}.xls`, headers, data);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={eyebrow}>FUTOI · 10 мин</div>
          <h2 style={title}>{heading(kind, group)}</h2>
        </div>
        <button
          type="button"
          onClick={exportChart}
          disabled={!points.length}
          style={{ ...secondaryBtn, padding: '6px 10px', fontSize: 12, opacity: points.length ? 1 : 0.5 }}
        >
          XLS
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', margin: '0 0 8px' }}>
        {legendItems(kind).map((item) => (
          <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-muted-foreground)' }}>
            <span aria-hidden style={{ width: 10, height: 10, background: item.color, borderRadius: 2 }} />
            {item.label}
          </span>
        ))}
      </div>
      <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: 220 }}>
        {loadLabel ? (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px',
              borderRadius: 8,
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              fontSize: 12,
              color: 'var(--color-muted-foreground)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                border: '2px solid var(--color-border)',
                borderTopColor: 'var(--color-primary)',
                animation: 'futoi-spin 0.8s linear infinite',
              }}
            />
            {loadLabel}
          </div>
        ) : null}
        {tip ? (
          <div
            role="tooltip"
            style={{
              position: 'absolute',
              left: tip.x,
              top: tip.y,
              zIndex: 4,
              minWidth: 200,
              padding: '10px 12px',
              borderRadius: 6,
              background: 'var(--color-card)',
              color: 'var(--color-card-foreground)',
              border: '1px solid var(--color-border)',
              fontSize: 12,
              lineHeight: 1.45,
              pointerEvents: 'none',
              boxShadow: '0 8px 24px rgba(11,18,32,0.18)',
            }}
          >
            <div style={{ marginBottom: 6, fontWeight: 500 }}>{formatCabinetTs(tip.ts)}</div>
            {tip.items.map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: item.color, flex: '0 0 auto' }} />
                <span>
                  {item.label}: {formatRuInt(item.value)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <div ref={hostRef} style={{ width: '100%', height: 220 }} />
      </div>
      <p style={hint}>
        {last ? `${last} · ` : ''}
        наведение — значения точки, XLS — выгрузка ряда
        {stale ? ' · нет связи с Мосбиржей, пример ряда' : ''}
      </p>
    </div>
  );
}
