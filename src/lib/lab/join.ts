import type { SeriesPoint } from '@/lib/types';
import type { OiStatus } from './types';

export type OiSnap = {
  oi: number;
  oi_ref: number | null;
  oi_change: number | null;
  oi_change_ln: number | null;
  oi_fresh: boolean;
  fiz_long: number;
  fiz_short: number;
  yur_long: number;
  yur_short: number;
  snapshot_time: string;
  received_time: string;
  snapshot_age_sec: number;
  status: OiStatus;
};

function oiOf(p: SeriesPoint): number {
  return p.fiz.posLong + p.yur.posLong;
}

export function tsOf(p: SeriesPoint): string {
  const raw = p.ts.replace(' ', 'T');
  const ms = Date.parse(raw.includes('+') || raw.endsWith('Z') ? raw : `${raw}+03:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : raw;
}

export function joinOi(
  points: SeriesPoint[],
  barStartIso: string,
  nowIso: string,
  windowMin: number,
  freshMaxMin: number,
): OiSnap | { status: 'unavailable' } {
  const barStart = Date.parse(barStartIso);
  const eligible = points
    .map((p) => ({ p, t: Date.parse(tsOf(p)) }))
    .filter((x) => Number.isFinite(x.t) && x.t < barStart)
    .sort((a, b) => a.t - b.t);
  const last = eligible.at(-1);
  if (!last) return { status: 'unavailable' };

  const ageSec = Math.max(0, Math.round((barStart - last.t) / 1000));
  const windowStart = last.t - windowMin * 60_000;
  const ref = [...eligible].reverse().find((x) => x.t <= windowStart) ?? eligible[0];
  const oi = oiOf(last.p);
  const oiRef = oiOf(ref.p);
  const oiChangeLn = oi > 0 && oiRef > 0 ? Math.log(oi / oiRef) : null;
  return {
    oi,
    oi_ref: oiRef,
    oi_change: oi - oiRef,
    oi_change_ln: oiChangeLn,
    oi_fresh: ageSec <= freshMaxMin * 60,
    fiz_long: last.p.fiz.posLong,
    fiz_short: last.p.fiz.posShort,
    yur_long: last.p.yur.posLong,
    yur_short: last.p.yur.posShort,
    snapshot_time: tsOf(last.p),
    received_time: nowIso,
    snapshot_age_sec: ageSec,
    status: 'available',
  };
}

export function oiPositive(snap: OiSnap | { status: 'unavailable' }): boolean | null {
  if (snap.status === 'unavailable') return null;
  if (snap.oi_change_ln != null) return snap.oi_change_ln > 0;
  return (snap.oi_change ?? 0) > 0;
}
