import { apiPath } from '@/lib/api-base';
import { downsample10m, replaceDayPoints } from '@/lib/chart-series';
import { STATIC } from '@/lib/static-mode';
import { authHeaders } from '@/lib/token-local';
import { HISTORY_FLOOR, type SeriesPoint } from '@/lib/types';

export function moscowToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dateFromUnix(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
}

export function enumerateDays(from: string, to: string, max = 90): string[] {
  if (!from || !to || from > to) return [];
  const start = from < HISTORY_FLOOR ? HISTORY_FLOOR : from;
  const days: string[] = [];
  for (let d = start; d <= to && days.length < max; d = addDays(d, 1)) days.push(d);
  return days;
}

export function mergePoints(current: SeriesPoint[], incoming: SeriesPoint[]): SeriesPoint[] {
  return replaceDayPoints(current, downsample10m(incoming));
}

export function formatDayRu(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Moscow',
  });
}

export async function fetchDaySeries(
  secid: string,
  date: string,
): Promise<{ points: SeriesPoint[]; stale?: boolean }> {
  if (STATIC) return { points: [], stale: true };
  const q = new URLSearchParams({ secid, from: date, to: date });
  const res = await fetch(apiPath(`/api/futoi/series?${q}`), { headers: authHeaders() });
  const json = (await res.json()) as { points?: SeriesPoint[]; stale?: boolean; error?: string };
  if (json.error === 'subscription_expired' || res.status === 403) {
    throw Object.assign(new Error('subscription_expired'), { name: 'MoexAuth' });
  }
  if (!res.ok) throw new Error(json.error || `http_${res.status}`);
  return { points: downsample10m(json.points ?? []), stale: json.stale };
}
