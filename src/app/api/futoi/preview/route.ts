import { NextResponse } from 'next/server';
import { fixtureSeries, fixtureSnapshot } from '@/lib/fixture';
import { DEFAULT_SECID } from '@/lib/types';

function todayMoscow(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
}

/** Sync first paint — no MOEX. Default Si session tail. */
export async function GET(request: Request) {
  const secid = new URL(request.url).searchParams.get('secid')?.trim() || DEFAULT_SECID;
  const date = todayMoscow();
  const points = fixtureSeries(secid, date).slice(-36);
  return NextResponse.json({
    snapshot: fixtureSnapshot(secid, date),
    series: { secid, points, stale: true },
    stale: true,
  });
}
