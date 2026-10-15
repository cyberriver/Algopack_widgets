import { NextResponse } from 'next/server';
import { newExperiment, withLabState } from '@/lib/lab/store';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { confirm?: boolean };
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'confirmation_required' }, { status: 400 });
  }

  const session = await withLabState((state) => {
    const current = state.experiments.find((item) => item.id === state.selected_experiment_id);
    if (!current) throw new Error('experiment_not_found');
    const clean = newExperiment({
      name: current.name,
      protocol: { ...current.protocol },
      entry_rule: current.entry_rule,
      execution_mode: current.execution_mode,
      capital_limit_rub: current.capital_limit_rub,
      quantity_mode: current.quantity_mode,
      fixed_lots: current.fixed_lots,
      status: current.status,
    });
    current.session = clean.session;
    current.events = [];
    current.trades = [];
    current.annotations = {};
    current.processed_bar_ends = [];
    current.started_at = clean.started_at;
    current.last_tick_at = null;
    current.last_error = null;
    return current.session;
  });
  return NextResponse.json({ status: 'ok', session });
}
