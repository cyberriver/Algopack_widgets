import { NextResponse } from 'next/server';
import { summarize } from '@/lib/lab/engine';
import { readLabState } from '@/lib/lab/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = readLabState();
  const selected =
    state.experiments.find((experiment) => experiment.id === state.selected_experiment_id) ?? state.experiments[0];
  return NextResponse.json({
    protocol: state.protocol,
    session: state.session,
    experiments: state.experiments,
    selected_experiment_id: state.selected_experiment_id,
    last_tick_at: state.last_tick_at,
    last_error: state.last_error,
    events: state.events,
    trades: state.trades,
    annotations: state.annotations,
    hypotheses: state.hypotheses,
    last_futoi_ok_at: state.last_futoi_ok_at,
    last_futoi_asof: state.last_futoi_asof,
    coverage_gaps: state.coverage_gaps,
    summary: summarize(selected),
  });
}
