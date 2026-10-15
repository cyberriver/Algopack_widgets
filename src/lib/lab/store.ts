import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultHypotheses } from './hypotheses';
import { buildCompletionReport } from './performance';
import {
  defaultProtocol,
  type Annotation,
  type EntryRule,
  type ExecutionMode,
  type HypothesisId,
  type HypothesisRow,
  type HypothesisStatus,
  type LabExperiment,
  type LabState,
  type Protocol,
  type QuantityMode,
} from './types';

function resolveStateFile(): string {
  if (process.env.LAB_STATE_FILE) return process.env.LAB_STATE_FILE;
  const candidates = [join(process.cwd(), 'data/lab/state.json'), '/tmp/algopack-lab/state.json'];
  for (const file of candidates) {
    try {
      mkdirSync(join(file, '..'), { recursive: true });
      return file;
    } catch {
      /* next candidate */
    }
  }
  return candidates[1];
}

const FILE = resolveStateFile();

let queue: Promise<unknown> = Promise.resolve();

function newSession(contract: string, protocolId: string) {
  const now = new Date();
  return {
    id: `sess_${now.getTime().toString(36)}_${contract}`,
    protocol_id: protocolId,
    mode: 'live_observation' as const,
    started_at: now.toISOString(),
    contract,
  };
}

export function newExperiment(input: {
  name: string;
  protocol?: Protocol;
  entry_rule?: EntryRule;
  execution_mode?: ExecutionMode;
  capital_limit_rub?: number | null;
  quantity_mode?: QuantityMode;
  fixed_lots?: number;
  status?: LabExperiment['status'];
}): LabExperiment {
  const now = new Date().toISOString();
  const protocol = input.protocol ?? defaultProtocol();
  const status = input.status ?? 'draft';
  return {
    id: `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim() || 'Эксперимент',
    status,
    entry_rule: input.entry_rule ?? 'price_breakout',
    execution_mode: input.execution_mode ?? 'virtual',
    capital_limit_rub: input.capital_limit_rub ?? null,
    quantity_mode: input.quantity_mode ?? 'fixed_lots',
    fixed_lots: Math.max(1, Math.floor(input.fixed_lots ?? 1)),
    created_at: now,
    started_at: status === 'running' ? now : null,
    completed_at: null,
    protocol,
    session: newSession(protocol.contract, protocol.id),
    events: [],
    trades: [],
    annotations: {},
    processed_bar_ends: [],
    backtests: [],
    completion_report: null,
    last_tick_at: null,
    last_error: null,
  };
}

function emptyState(): LabState {
  const protocol = defaultProtocol();
  const experiment = newExperiment({ name: 'Пробой цены', protocol, status: 'running' });
  return {
    protocol,
    session: newSession(protocol.contract, protocol.id),
    events: [],
    trades: [],
    annotations: {},
    hypotheses: defaultHypotheses(),
    coverage_gaps: [],
    price_receipts: {},
    futoi_receipts: {},
    processed_bar_ends: [],
    last_tick_at: null,
    last_futoi_ok_at: null,
    last_futoi_asof: null,
    last_error: null,
    experiments: [experiment],
    selected_experiment_id: experiment.id,
  };
}

function migrate(state: LabState): LabState {
  state.protocol = { ...defaultProtocol(), ...state.protocol };
  if (!state.hypotheses || !Object.keys(state.hypotheses).length) {
    state.hypotheses = defaultHypotheses();
  }
  if (!state.price_receipts) state.price_receipts = {};
  if (!state.futoi_receipts) state.futoi_receipts = {};
  if (!state.experiments?.length) {
    const experiment = newExperiment({
      name: 'Пробой цены',
      protocol: state.protocol,
      entry_rule: 'price_breakout',
      status: 'running',
    });
    experiment.session = state.session;
    experiment.events = state.events ?? [];
    experiment.trades = state.trades ?? [];
    experiment.annotations = state.annotations ?? {};
    experiment.processed_bar_ends = state.processed_bar_ends ?? [];
    experiment.last_tick_at = state.last_tick_at;
    experiment.last_error = state.last_error;
    state.experiments = [experiment];
    state.selected_experiment_id = experiment.id;
  }
  if (!state.experiments.some((experiment) => experiment.id === state.selected_experiment_id)) {
    state.selected_experiment_id = state.experiments[0].id;
  }
  for (const experiment of state.experiments) {
    experiment.backtests ??= [];
    if (experiment.status === 'completed' && !experiment.completion_report) {
      const completedAt = experiment.completed_at ?? new Date().toISOString();
      experiment.completed_at = completedAt;
      experiment.completion_report = buildCompletionReport(experiment, completedAt);
    } else {
      experiment.completion_report ??= null;
    }
  }
  if (state.last_futoi_ok_at === undefined) state.last_futoi_ok_at = null;
  if (state.last_futoi_asof === undefined) state.last_futoi_asof = null;
  if (state.protocol.id !== defaultProtocol().id) {
    const family = state.protocol.family || 'Si';
    const contract = state.protocol.contract || 'SiZ6';
    state.protocol = { ...defaultProtocol(), family, contract };
    state.session = newSession(contract, state.protocol.id);
    state.events = [];
    state.trades = [];
    state.price_receipts = {};
    state.futoi_receipts = {};
    state.processed_bar_ends = [];
    state.annotations = {};
    state.last_futoi_ok_at = null;
  }
  return state;
}

function read(): LabState {
  try {
    const raw = readFileSync(FILE, 'utf8');
    return migrate({ ...emptyState(), ...(JSON.parse(raw) as LabState) });
  } catch {
    return emptyState();
  }
}

function write(state: LabState): void {
  mkdirSync(join(FILE, '..'), { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(state, null, 2)}\n`);
}

export function withLabState<T>(fn: (state: LabState) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const state = read();
    const result = await fn(state);
    write(state);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function readLabState(): LabState {
  return read();
}

export function resetJournal(state: LabState, family: string, contract: string): void {
  state.protocol = { ...state.protocol, ...defaultProtocol(), family, contract, id: defaultProtocol().id };
  state.session = newSession(contract, state.protocol.id);
  state.events = [];
  state.trades = [];
  state.price_receipts = {};
  state.futoi_receipts = {};
  state.processed_bar_ends = [];
  state.annotations = {};
  state.coverage_gaps = [];
  state.last_error = null;
  state.last_tick_at = null;
  state.last_futoi_ok_at = null;
  state.last_futoi_asof = null;
}

export function upsertAnnotation(eventId: string, patch: Partial<Annotation>): Promise<Annotation> {
  return withLabState((state) => {
    const selected = state.experiments.find((experiment) => experiment.id === state.selected_experiment_id);
    const annotations = selected?.annotations ?? state.annotations;
    const prev = annotations[eventId] ?? {
      event_id: eventId,
      quality_review: 'not_reviewed',
      research_note: '',
      hypothesis_ids: [],
      updated_at: new Date().toISOString(),
    };
    const next: Annotation = {
      ...prev,
      ...patch,
      event_id: eventId,
      hypothesis_ids: patch.hypothesis_ids ?? prev.hypothesis_ids ?? [],
      updated_at: new Date().toISOString(),
    };
    annotations[eventId] = next;
    state.annotations = annotations;
    return next;
  });
}

export function upsertHypothesis(id: HypothesisId, status: HypothesisStatus): Promise<HypothesisRow> {
  return withLabState((state) => {
    const catalog = defaultHypotheses();
    const prev = state.hypotheses[id] ?? catalog[id];
    const next: HypothesisRow = { ...prev, status, updated_at: new Date().toISOString() };
    state.hypotheses[id] = next;
    return next;
  });
}
