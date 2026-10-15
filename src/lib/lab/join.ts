import type { SeriesPoint } from '@/lib/types';
import type { DataReceipt, OiStatus } from './types';

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

export type OiJoin =
  | OiSnap
  | { status: 'received_late'; snapshot_time: string; received_time: string }
  | { status: 'unavailable' };

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
  receipts: Record<string, DataReceipt>,
  barStartIso: string,
  deadlineIso: string,
  windowMin: number,
  freshMaxMin: number,
): OiJoin {
  const barStart = Date.parse(barStartIso);
  const deadline = Date.parse(deadlineIso);
  const sourceEligible = points
    .map((p) => {
      const sourceTime = tsOf(p);
      return { p, sourceTime, t: Date.parse(sourceTime), receipt: receipts[sourceTime] };
    })
    .filter((x) => Number.isFinite(x.t) && x.t < barStart)
    .sort((a, b) => a.t - b.t);
  const available = sourceEligible.filter((x) => {
    const received = Date.parse(x.receipt?.received_at ?? '');
    return Number.isFinite(received) && received <= deadline;
  });
  const last = available.at(-1);
  if (!last) {
    const late = sourceEligible.filter((x) => x.receipt).at(-1);
    if (late?.receipt) {
      return {
        status: 'received_late',
        snapshot_time: late.sourceTime,
        received_time: late.receipt.received_at,
      };
    }
    return { status: 'unavailable' };
  }

  const ageSec = Math.max(0, Math.round((barStart - last.t) / 1000));
  const windowStart = last.t - windowMin * 60_000;
  const ref = [...available].reverse().find((x) => x.t <= windowStart) ?? available[0];
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
    snapshot_time: last.sourceTime,
    received_time: last.receipt.received_at,
    snapshot_age_sec: ageSec,
    status: 'available',
  };
}

export function oiPositive(snap: OiJoin): boolean | null {
  if (snap.status !== 'available') return null;
  if (snap.oi_change_ln != null) return snap.oi_change_ln > 0;
  return (snap.oi_change ?? 0) > 0;
}
