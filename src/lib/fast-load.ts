import { apiPath } from '@/lib/api-base';
import { dataUrl, STATIC } from '@/lib/static-mode';
import type { SeriesPoint, SnapshotResponse } from '@/lib/types';

/** Last ~3 hours of 5-minute bars — enough to draw the default chart. */
export const FIRST_PAINT_POINTS = 36;

export function tailPoints(points: SeriesPoint[], limit = FIRST_PAINT_POINTS): SeriesPoint[] {
  if (points.length <= limit) return points;
  return points.slice(points.length - limit);
}

export async function fetchBakedSnapshot(secid: string): Promise<SnapshotResponse | null> {
  try {
    const res = await fetch(STATIC ? dataUrl(`snapshot-${secid}.json`) : apiPath(`/api/futoi/preview?secid=${encodeURIComponent(secid)}`));
    if (!res.ok) return null;
    const json = (await res.json()) as SnapshotResponse & { snapshot?: SnapshotResponse };
    return json.snapshot ?? json;
  } catch {
    return null;
  }
}

export async function fetchBakedSeries(secid: string): Promise<{ points: SeriesPoint[]; stale?: boolean }> {
  try {
    const res = await fetch(STATIC ? dataUrl(`series-${secid}.json`) : apiPath(`/api/futoi/preview?secid=${encodeURIComponent(secid)}`));
    if (!res.ok) return { points: [] };
    const json = (await res.json()) as {
      points?: SeriesPoint[];
      series?: { points?: SeriesPoint[]; stale?: boolean };
      stale?: boolean;
    };
    const points = json.series?.points ?? json.points ?? [];
    return { points: tailPoints(points), stale: json.series?.stale ?? json.stale ?? true };
  } catch {
    return { points: [] };
  }
}

export function whenIdle(fn: () => void): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => fn(), { timeout: 1200 });
    return;
  }
  setTimeout(fn, 0);
}
