import { NextResponse } from 'next/server';
import { buildInstrumentProfile } from '@/lib/lab/backtest';
import { getSeries, loadOhlcCandles } from '@/lib/moex';
import { serverTokenReady } from '@/lib/token-store';

export const dynamic = 'force-dynamic';

function exactDateRange(days: number): { from: string; to: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const contract = url.searchParams.get('contract')?.trim() ?? '';
  const family = url.searchParams.get('family')?.trim() ?? '';
  const days = Math.min(60, Math.max(5, Number(url.searchParams.get('days') ?? 20) || 20));
  if (!contract || !family) return NextResponse.json({ error: 'instrument_required' }, { status: 400 });
  if (!(await serverTokenReady())) return NextResponse.json({ error: 'moex_token_required' }, { status: 503 });
  const { from, to } = exactDateRange(days);
  try {
    const [bars, series] = await Promise.all([
      loadOhlcCandles(contract, from, to),
      getSeries(family, from, to, { skipPrices: true }),
    ]);
    return NextResponse.json({ profile: buildInstrumentProfile(bars, series.points, contract, family, from, to) });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : String(caught) },
      { status: 502 },
    );
  }
}
