import { NextResponse } from 'next/server';
import { runHistoricalReplay } from '@/lib/lab/backtest';
import { readLabState, withLabState } from '@/lib/lab/store';
import { getSeries, loadOhlcCandles } from '@/lib/moex';
import { serverTokenReady } from '@/lib/token-store';

export const dynamic = 'force-dynamic';

function exactDateRange(days: number): { from: string; to: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    experiment_id?: string;
    days?: number;
    calibration_percent?: number;
    starting_capital_rub?: number;
    risk_per_trade_percent?: number;
  };
  const source = readLabState().experiments.find((item) => item.id === body.experiment_id);
  if (!source) return NextResponse.json({ error: 'experiment_not_found' }, { status: 404 });
  if (!(await serverTokenReady())) return NextResponse.json({ error: 'moex_token_required' }, { status: 503 });
  const days = Math.min(60, Math.max(5, Number(body.days ?? 20) || 20));
  const calibrationPercent = Math.min(90, Math.max(50, Number(body.calibration_percent ?? 70) || 70));
  const startingCapitalRub = Math.min(1_000_000_000, Math.max(1_000, Number(body.starting_capital_rub ?? 15_000) || 15_000));
  const riskPerTradePercent = Math.min(20, Math.max(0.1, Number(body.risk_per_trade_percent ?? 1) || 1));
  const { from, to } = exactDateRange(days);
  try {
    const [bars, series] = await Promise.all([
      loadOhlcCandles(source.protocol.contract, from, to),
      getSeries(source.protocol.family, from, to, { skipPrices: true }),
    ]);
    const run = runHistoricalReplay(
      bars,
      series.points,
      source,
      from,
      to,
      calibrationPercent,
      startingCapitalRub,
      riskPerTradePercent,
    );
    await withLabState((state) => {
      const experiment = state.experiments.find((item) => item.id === source.id);
      if (!experiment) throw new Error('experiment_not_found');
      experiment.backtests.unshift(run);
      experiment.backtests = experiment.backtests.slice(0, 10);
    });
    return NextResponse.json({ run });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : String(caught) },
      { status: 502 },
    );
  }
}
