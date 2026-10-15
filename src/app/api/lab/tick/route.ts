import { NextResponse } from 'next/server';
import { runLabTick } from '@/lib/lab/worker';

export const dynamic = 'force-dynamic';

export async function GET() {
  return POST();
}

export async function POST() {
  const result = await runLabTick();
  return NextResponse.json({
    protocol: result.state.protocol,
    session: result.state.session,
    last_tick_at: result.state.last_tick_at,
    last_error: result.state.last_error,
    events: result.state.events,
    trades: result.state.trades,
    annotations: result.state.annotations,
    hypotheses: result.state.hypotheses,
    last_futoi_ok_at: result.state.last_futoi_ok_at,
    coverage_gaps: result.state.coverage_gaps,
    readiness: result.readiness,
    summary: result.summary,
    fetched: result.fetched,
    applied: result.applied,
  });
}
