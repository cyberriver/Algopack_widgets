import { ASSET_NAMES, type SeriesPoint, type SnapshotBlock, type SnapshotResponse } from './types';

function sessionTimes(date: string): string[] {
  const out: string[] = [];
  for (let minutes = 10 * 60; minutes <= 18 * 60 + 45; minutes += 5) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    out.push(`${date}T${hh}:${mm}:00`);
  }
  return out;
}

function metrics(base: number, i: number, sign: number) {
  const wave = Math.sin(i / 9) * sign;
  const posLong = Math.round(base + wave * 1600 + i * 6);
  const posShort = Math.round(base * 0.72 - wave * 1100 + i * 3);
  const posLongNum = Math.round(1800 + wave * 80 + i);
  const posShortNum = Math.round(1400 - wave * 60 + i * 0.4);
  return {
    posLong,
    posShort,
    posLongNum,
    posShortNum,
    openInterest: posLong + posShort,
    directed: posLong - posShort,
  };
}

export function fixtureSeries(secid: string, date: string): SeriesPoint[] {
  const price0 = secid.toLowerCase() === 'si' ? 78.4 : 100;
  return sessionTimes(date).map((ts, i) => ({
    ts,
    price: Number((price0 + Math.sin(i / 12) * 0.18 + i * 0.002).toFixed(4)),
    fiz: metrics(42_000, i, 1),
    yur: metrics(61_000, i, -1),
  }));
}

function blockFromPoint(ts: string, point: SeriesPoint): SnapshotBlock {
  const [tradedate, tradetime] = ts.includes('T') ? ts.split('T') : [ts.slice(0, 10), ts.slice(11)];
  return {
    tradedate,
    tradetime: tradetime.slice(0, 8),
    fizLong: point.fiz.posLong,
    fizShort: point.fiz.posShort,
    yurLong: point.yur.posLong,
    yurShort: point.yur.posShort,
    fizLongNum: point.fiz.posLongNum,
    fizShortNum: point.fiz.posShortNum,
    yurLongNum: point.yur.posLongNum,
    yurShortNum: point.yur.posShortNum,
    totalOi: point.fiz.openInterest + point.yur.openInterest,
  };
}

export function fixtureSnapshot(secid: string, date: string): SnapshotResponse {
  const points = fixtureSeries(secid, date);
  const current = blockFromPoint(points.at(-1)!.ts, points.at(-1)!);
  const previousClose = blockFromPoint(points[0].ts, points[0]);
  return {
    secid,
    assetName: ASSET_NAMES[secid] ?? secid,
    current,
    previousClose,
    deltaContracts: {
      ...current,
      fizLong: current.fizLong - previousClose.fizLong,
      fizShort: current.fizShort - previousClose.fizShort,
      yurLong: current.yurLong - previousClose.yurLong,
      yurShort: current.yurShort - previousClose.yurShort,
      fizLongNum: 0,
      fizShortNum: 0,
      yurLongNum: 0,
      yurShortNum: 0,
      totalOi: current.totalOi - previousClose.totalOi,
    },
    deltaPersons: {
      ...current,
      fizLong: current.fizLongNum - previousClose.fizLongNum,
      fizShort: current.fizShortNum - previousClose.fizShortNum,
      yurLong: current.yurLongNum - previousClose.yurLongNum,
      yurShort: current.yurShortNum - previousClose.yurShortNum,
      fizLongNum: current.fizLongNum - previousClose.fizLongNum,
      fizShortNum: current.fizShortNum - previousClose.fizShortNum,
      yurLongNum: current.yurLongNum - previousClose.yurLongNum,
      yurShortNum: current.yurShortNum - previousClose.yurShortNum,
      totalOi:
        current.fizLongNum +
        current.fizShortNum +
        current.yurLongNum +
        current.yurShortNum -
        (previousClose.fizLongNum +
          previousClose.fizShortNum +
          previousClose.yurLongNum +
          previousClose.yurShortNum),
    },
    stale: true,
  };
}
