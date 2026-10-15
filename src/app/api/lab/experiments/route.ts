import { NextResponse } from 'next/server';
import { newExperiment, withLabState } from '@/lib/lab/store';
import { defaultProtocol, type EntryRule, type ExecutionMode, type QuantityMode } from '@/lib/lab/types';
import { buildCompletionReport } from '@/lib/lab/performance';

export const dynamic = 'force-dynamic';

type CreateBody = {
  name?: string;
  family?: string;
  contract?: string;
  entry_rule?: EntryRule;
  execution_mode?: ExecutionMode;
  capital_limit_rub?: number | null;
  quantity_mode?: QuantityMode;
  fixed_lots?: number;
  parameters?: Partial<ReturnType<typeof defaultProtocol>>;
};

function validBody(body: CreateBody): string | null {
  if (!body.name?.trim()) return 'name_required';
  if (!body.family?.trim() || !body.contract?.trim()) return 'instrument_required';
  if (!['price_breakout', 'price_breakout_oi_up'].includes(body.entry_rule ?? '')) return 'entry_rule_invalid';
  if (!['virtual', 'real'].includes(body.execution_mode ?? '')) return 'execution_mode_invalid';
  if (body.execution_mode === 'real' && (!body.capital_limit_rub || body.capital_limit_rub <= 0)) return 'capital_limit_required';
  return null;
}

export async function GET() {
  return withLabState((state) =>
    NextResponse.json({ experiments: state.experiments, selected_experiment_id: state.selected_experiment_id }),
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const error = validBody(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const experiment = await withLabState((state) => {
    const base = defaultProtocol();
    const protocol = {
      ...base,
      ...(body.parameters ?? {}),
      family: body.family!.trim(),
      contract: body.contract!.trim(),
    };
    const created = newExperiment({
      name: body.name!,
      protocol,
      entry_rule: body.entry_rule,
      execution_mode: body.execution_mode,
      capital_limit_rub: body.capital_limit_rub,
      quantity_mode: body.quantity_mode,
      fixed_lots: body.fixed_lots,
    });
    state.experiments.push(created);
    state.selected_experiment_id = created.id;
    return created;
  });
  return NextResponse.json({ experiment }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    action?: 'select' | 'start' | 'pause' | 'complete' | 'clone';
  };
  if (!body.id || !body.action) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const experiment = await withLabState((state) => {
      const current = state.experiments.find((item) => item.id === body.id);
      if (!current) throw new Error('experiment_not_found');
      if (body.action === 'select') {
        state.selected_experiment_id = current.id;
        return current;
      }
      if (body.action === 'clone') {
        const clone = newExperiment({
          name: `${current.name} — копия`,
          protocol: { ...current.protocol },
          entry_rule: current.entry_rule,
          execution_mode: current.execution_mode,
          capital_limit_rub: current.capital_limit_rub,
          quantity_mode: current.quantity_mode,
          fixed_lots: current.fixed_lots,
        });
        state.experiments.push(clone);
        state.selected_experiment_id = clone.id;
        return clone;
      }
      if (body.action === 'start') {
        if (current.execution_mode === 'real') throw new Error('real_execution_not_connected');
        if (current.status !== 'draft' && current.status !== 'paused') throw new Error('experiment_not_startable');
        current.status = 'running';
        current.started_at ??= new Date().toISOString();
      } else if (body.action === 'pause') {
        if (current.status !== 'running') throw new Error('experiment_not_running');
        current.status = 'paused';
      } else if (body.action === 'complete') {
        const completedAt = new Date().toISOString();
        current.status = 'completed';
        current.completed_at = completedAt;
        current.completion_report = buildCompletionReport(current, completedAt);
      }
      return current;
    });
    return NextResponse.json({ experiment });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    const status = message === 'experiment_not_found' ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
