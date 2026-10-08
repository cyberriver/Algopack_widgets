import type { SeriesPoint } from '@/lib/types';

/** FUTOI timestamps are Moscow wall time, no DST. */
export function toMoscowUnix(ts: string): number {
  const raw = (ts.includes('T') ? ts : ts.replace(' ', 'T')).slice(0, 19);
  const ms = Date.parse(`${raw}+03:00`);
  return Math.floor((Number.isFinite(ms) ? ms : Date.now()) / 1000);
}

export function dayKey(ts: string): string {
  return ts.slice(0, 10);
}

/** Incoming day replaces that calendar day instead of interleaving leftover bars. */
export function replaceDayPoints(current: SeriesPoint[], incoming: SeriesPoint[]): SeriesPoint[] {
  if (!incoming.length) return current;
  const days = new Set(incoming.map((p) => dayKey(p.ts)));
  const kept = current.filter((p) => !days.has(dayKey(p.ts)));
  return [...kept, ...incoming].sort((a, b) => toMoscowUnix(a.ts) - toMoscowUnix(b.ts));
}

const AXIS_EPOCH = 1_700_000_000;
const AXIS_STEP = 600;
/** Session 07:00–23:30. 23:40 and 23:50 are the close and leave a hanging tail. */
const BARS_PER_SESSION = 100;
const SESSION_OPEN = 'T07:00:00';
const SESSION_CUTOFF = new Set(['23:40', '23:50']);

const WEEKDAY_EPOCH = Date.parse('2015-01-01T12:00:00Z');
const weekdayMemo = new Map<string, number>();

function weekdaysInRange(fromMs: number, toMs: number): number {
  const days = Math.round((toMs - fromMs) / 86_400_000);
  if (days === 0) return 0;
  const sign = days < 0 ? -1 : 1;
  const abs = Math.abs(days);
  const rem = abs % 7;
  let n = Math.floor(abs / 7) * 5;
  const dow0 = new Date(sign > 0 ? fromMs : toMs).getUTCDay();
  for (let i = 0; i < rem; i += 1) {
    const dow = (dow0 + i) % 7;
    if (dow !== 0 && dow !== 6) n += 1;
  }
  return sign * n;
}

export function weekdayIndex(iso: string): number {
  const cached = weekdayMemo.get(iso);
  if (cached !== undefined) return cached;
  const end = Date.parse(`${iso}T12:00:00Z`);
  const n = Number.isFinite(end) ? weekdaysInRange(WEEKDAY_EPOCH, end) : 0;
  weekdayMemo.set(iso, n);
  return n;
}

/** Keep official 10-minute prints (:00/:10/:20/:30/:40/:50), as in the cabinet. */
export function downsample10m(points: SeriesPoint[]): SeriesPoint[] {
  const kept = new Map<string, SeriesPoint>();
  for (const point of points) {
    const hhmm = point.ts.slice(11, 16);
    if (SESSION_CUTOFF.has(hhmm)) continue;
    const mm = Number(point.ts.slice(14, 16));
    if (!Number.isFinite(mm) || mm % 10 !== 0) continue;
    const key = point.ts.slice(0, 16);
    const prev = kept.get(key);
    if (!prev || toMoscowUnix(point.ts) >= toMoscowUnix(prev.ts)) kept.set(key, point);
  }
  return [...kept.values()].sort((a, b) => toMoscowUnix(a.ts) - toMoscowUnix(b.ts));
}

export function sessionWaveIndex(date: string, barInDay: number): number {
  return weekdayIndex(date) * BARS_PER_SESSION + barInDay;
}

/** Sequential trading-time for one continuous line: no overnight stretch. */
export function sessionAxisTime(ts: string): number {
  const day = dayKey(ts);
  const raw = Math.round((toMoscowUnix(ts) - toMoscowUnix(`${day}${SESSION_OPEN}`)) / AXIS_STEP);
  const bar = Math.min(BARS_PER_SESSION - 1, Math.max(0, raw));
  return AXIS_EPOCH + sessionWaveIndex(day, bar) * AXIS_STEP;
}

/** LWC requires strictly ascending time. Weekend / after-midnight bars can invert weekday compression. */
export function axisPoints(rows: SeriesPoint[]): Array<{ time: number; ts: string }> {
  let last = 0;
  return rows.map((p) => {
    let time = sessionAxisTime(p.ts);
    if (time <= last) time = last + AXIS_STEP;
    last = time;
    return { time, ts: p.ts };
  });
}

export function formatSessionLabel(ts: string): string {
  const day = dayKey(ts);
  const hhmm = ts.slice(11, 16);
  const d = new Date(`${day}T12:00:00`).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Europe/Moscow',
  });
  return `${d} ${hhmm}`;
}

export function carryPrice(rows: SeriesPoint[]): SeriesPoint[] {
  let last: number | null = null;
  return rows.map((p) => {
    if (p.price != null) last = p.price;
    return last == null ? p : { ...p, price: p.price ?? last };
  });
}
