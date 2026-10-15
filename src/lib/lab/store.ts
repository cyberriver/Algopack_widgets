import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultHypotheses } from './hypotheses';
import { defaultProtocol, type Annotation, type HypothesisId, type HypothesisRow, type HypothesisStatus, type LabState } from './types';

const FILE = join(process.cwd(), 'data/lab/state.json');

let queue: Promise<unknown> = Promise.resolve();

function newSession(contract: string, protocolId: string) {
  return {
    id: `sess_${new Date().toISOString().slice(0, 10)}_${contract}`,
    protocol_id: protocolId,
    mode: 'live_observation' as const,
    started_at: new Date().toISOString(),
    contract,
  };
}

function emptyState(): LabState {
  const protocol = defaultProtocol();
  return {
    protocol,
    session: newSession(protocol.contract, protocol.id),
    events: [],
    trades: [],
    annotations: {},
    hypotheses: defaultHypotheses(),
    coverage_gaps: [],
    processed_bar_ends: [],
    last_tick_at: null,
    last_futoi_ok_at: null,
    last_error: null,
  };
}

function migrate(state: LabState): LabState {
  if (!state.hypotheses || !Object.keys(state.hypotheses).length) {
    state.hypotheses = defaultHypotheses();
  }
  if (state.last_futoi_ok_at === undefined) state.last_futoi_ok_at = null;
  if (state.protocol.id !== defaultProtocol().id) {
    const family = state.protocol.family || 'Si';
    const contract = state.protocol.contract || 'SiZ6';
    state.protocol = { ...defaultProtocol(), family, contract };
    state.session = newSession(contract, state.protocol.id);
    state.events = [];
    state.trades = [];
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
  mkdirSync(join(process.cwd(), 'data/lab'), { recursive: true });
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
  state.processed_bar_ends = [];
  state.annotations = {};
  state.coverage_gaps = [];
  state.last_error = null;
  state.last_tick_at = null;
  state.last_futoi_ok_at = null;
}

export function upsertAnnotation(eventId: string, patch: Partial<Annotation>): Promise<Annotation> {
  return withLabState((state) => {
    const prev = state.annotations[eventId] ?? {
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
    state.annotations[eventId] = next;
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
