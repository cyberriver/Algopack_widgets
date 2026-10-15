import { NextResponse } from 'next/server';
import { summarize } from '@/lib/lab/engine';
import { readLabState } from '@/lib/lab/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = readLabState();
  return NextResponse.json({
    protocol: state.protocol,
    session: state.session,
    last_tick_at: state.last_tick_at,
    last_error: state.last_error,
    events: state.events,
    trades: state.trades,
    annotations: state.annotations,
    hypotheses: state.hypotheses,
    last_futoi_ok_at: state.last_futoi_ok_at,
    coverage_gaps: state.coverage_gaps,
    summary: summarize(state),
  });
}
