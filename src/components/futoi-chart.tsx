'use client';

import { useEffect, useRef } from 'react';
import { ColorType, createChart, LineSeries, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import type { ClGroup, SeriesPoint } from '@/lib/types';
import { eyebrow, hint, title } from './styles';

export type ChartKind = 'long-short' | 'persons' | 'oi' | 'directed';

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

function toTime(ts: string): UTCTimestamp {
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T');
  const ms = Date.parse(iso);
  return Math.floor((Number.isFinite(ms) ? ms : Date.now()) / 1000) as UTCTimestamp;
}

function uniquePoints(points: SeriesPoint[]): SeriesPoint[] {
  const seen = new Set<number>();
  return [...points]
    .sort((a, b) => toTime(a.ts) - toTime(b.ts))
    .filter((p) => {
      const t = toTime(p.ts);
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });
}

const LONG = '#12A36A';
const SHORT = '#D64545';
const OI = '#5B7CFF';
const DIR = '#D4A017';
const PRICE = '#8B95A8';

export function FutoiChart({
  kind,
  group,
  points,
  stale,
}: {
  kind: ChartKind;
  group: ClGroup;
  points: SeriesPoint[];
  stale?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rows = uniquePoints(points);
  const seriesKey = `${kind}:${group}:${rows.length}:${rows.at(0)?.ts ?? ''}:${rows.at(-1)?.ts ?? ''}`;

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !rows.length) return;

    const chart = createChart(el, {
      width: Math.max(el.clientWidth, 320),
      height: 220,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#5A6578',
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: '#E8ECF1' },
        horzLines: { color: '#E8ECF1' },
      },
      rightPriceScale: { borderColor: '#D5DBE5' },
      leftPriceScale: { visible: true, borderColor: '#D5DBE5' },
      timeScale: { borderColor: '#D5DBE5' },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;

    const price = chart.addSeries(LineSeries, {
      color: PRICE,
      lineWidth: 1,
      priceScaleId: 'left',
    });
    const a = chart.addSeries(LineSeries, {
      color: kind === 'oi' ? OI : kind === 'directed' ? DIR : LONG,
      lineWidth: 2,
      priceScaleId: 'right',
    });
    const needB = kind === 'long-short' || kind === 'persons';
    const b = needB
      ? chart.addSeries(LineSeries, { color: SHORT, lineWidth: 2, priceScaleId: 'right' })
      : null;

    const priceData = rows
      .filter((p) => p.price != null)
      .map((p) => ({ time: toTime(p.ts), value: p.price as number }));
    if (priceData.length) price.setData(priceData);

    a.setData(rows.map((p) => ({ time: toTime(p.ts), value: pick(p, group, kind)[0] ?? 0 })));
    b?.setData(rows.map((p) => ({ time: toTime(p.ts), value: pick(p, group, kind)[1] ?? 0 })));
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (!el.clientWidth) return;
      chart.applyOptions({ width: el.clientWidth, height: 220 });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [seriesKey, kind, group, rows]);

  const last = rows.at(-1)?.ts ?? '';

  return (
    <div>
      <div style={eyebrow}>FUTOI · 5 мин</div>
      <h2 style={title}>{heading(kind, group)}</h2>
      {rows.length ? (
        <div ref={hostRef} style={{ width: '100%', height: 220 }} />
      ) : (
        <p style={hint}>Нет ряда за выбранную сессию</p>
      )}
      <p style={hint}>
        Цена контракта · {kind === 'long-short' || kind === 'persons' ? 'длинные / короткие' : kind === 'oi' ? 'сумма' : 'направленная'}
        {last ? ` · ${last}` : ''} · обновление 5 мин
        {stale ? ' · нет связи с Мосбиржей, пример ряда' : ''}
      </p>
    </div>
  );
}
