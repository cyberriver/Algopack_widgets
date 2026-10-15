'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiPath } from '@/lib/api-base';
import type { OhlcBar } from '@/lib/moex';
import type {
  Annotation,
  HypothesisId,
  HypothesisRow,
  HypothesisStatus,
  LabEvent,
  LabExperiment,
  InstrumentProfile,
  LabMarket,
  LabTrade,
  Protocol,
  QualityReview,
  Readiness,
  Session,
} from '@/lib/lab/types';

export type LabSummaryRow = {
  variant: string;
  events: number;
  trades: number;
  closed: number;
  skipped: number;
  wins: number;
  net_r: number;
  avg_r: number | null;
};

export type LabPayload = {
  protocol: Protocol;
  session: Session;
  experiments: LabExperiment[];
  selected_experiment_id: string;
  last_tick_at: string | null;
  last_futoi_ok_at: string | null;
  last_futoi_asof?: string | null;
  market?: LabMarket | null;
  recent_bars?: OhlcBar[];
  last_error: string | null;
  events: LabEvent[];
  trades: LabTrade[];
  annotations: Record<string, Annotation>;
  hypotheses: Record<HypothesisId, HypothesisRow>;
  readiness?: Readiness;
  summary: LabSummaryRow[];
  fetched?: { bars: number; futoi: number };
  applied?: { newEvents: number; newTrades: number };
};

type LabStore = {
  data: LabPayload | null;
  loading: boolean;
  error: string | null;
};

const listeners = new Set<(s: LabStore) => void>();
let store: LabStore = { data: null, loading: true, error: null };
let inflight: Promise<void> | null = null;
let pollId: ReturnType<typeof setInterval> | null = null;
let refs = 0;

function emit(next: LabStore) {
  store = next;
  listeners.forEach((fn) => fn(store));
}

async function runTick(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(apiPath('/api/lab/tick'), { method: 'POST' });
      if (!res.ok) throw new Error(`tick ${res.status}`);
      emit({ data: (await res.json()) as LabPayload, loading: false, error: null });
    } catch (e) {
      emit({
        data: store.data,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function retain(pollMs: number) {
  refs += 1;
  if (refs === 1) {
    void runTick();
    pollId = setInterval(() => void runTick(), pollMs);
  }
}

function release() {
  refs = Math.max(0, refs - 1);
  if (refs === 0 && pollId) {
    clearInterval(pollId);
    pollId = null;
  }
}

export function useLab(pollMs = 30_000) {
  const [snap, setSnap] = useState(store);

  useEffect(() => {
    listeners.add(setSnap);
    retain(pollMs);
    return () => {
      listeners.delete(setSnap);
      release();
    };
  }, [pollMs]);

  const annotate = useCallback(
    async (
      eventId: string,
      patch: { quality_review?: QualityReview; research_note?: string; hypothesis_ids?: HypothesisId[] },
    ) => {
      const res = await fetch(apiPath('/api/lab/annotations'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, ...patch }),
      });
      if (!res.ok) throw new Error(`annotate ${res.status}`);
      const { annotation } = (await res.json()) as { annotation: Annotation };
      if (store.data) {
        emit({
          ...store,
          data: { ...store.data, annotations: { ...store.data.annotations, [eventId]: annotation } },
        });
      }
    },
    [],
  );

  const setHypothesis = useCallback(async (id: HypothesisId, status: HypothesisStatus) => {
    const res = await fetch(apiPath('/api/lab/hypotheses'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) throw new Error(`hypothesis ${res.status}`);
    const { hypothesis } = (await res.json()) as { hypothesis: HypothesisRow };
    if (store.data) {
      emit({ ...store, data: { ...store.data, hypotheses: { ...store.data.hypotheses, [id]: hypothesis } } });
    }
  }, []);

  const setInstrument = useCallback(async (ticker: string) => {
    const res = await fetch(apiPath('/api/lab/instrument'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, confirm: true }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `instrument ${res.status}`);
    }
  }, []);

  const resetExperiment = useCallback(async () => {
    const res = await fetch(apiPath('/api/lab/reset'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    if (!res.ok) throw new Error(`reset ${res.status}`);
    await runTick();
  }, []);

  const createExperiment = useCallback(async (input: Record<string, unknown>) => {
    const res = await fetch(apiPath('/api/lab/experiments'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? `experiment ${res.status}`);
    await runTick();
  }, []);

  const experimentAction = useCallback(async (id: string, action: 'select' | 'start' | 'pause' | 'complete' | 'clone') => {
    const res = await fetch(apiPath('/api/lab/experiments'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? `experiment ${res.status}`);
    await runTick();
  }, []);

  const loadProfile = useCallback(async (family: string, contract: string, days = 20): Promise<InstrumentProfile> => {
    const query = new URLSearchParams({ family, contract, days: String(days) });
    const res = await fetch(apiPath(`/api/lab/profile?${query}`));
    const body = (await res.json().catch(() => ({}))) as { profile?: InstrumentProfile; error?: string };
    if (!res.ok || !body.profile) throw new Error(body.error ?? `profile ${res.status}`);
    return body.profile;
  }, []);

  const runBacktest = useCallback(async (
    experimentId: string,
    days = 20,
    calibrationPercent = 70,
    startingCapitalRub = 15_000,
    riskPerTradePercent = 1,
  ) => {
    const res = await fetch(apiPath('/api/lab/backtest'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        experiment_id: experimentId,
        days,
        calibration_percent: calibrationPercent,
        starting_capital_rub: startingCapitalRub,
        risk_per_trade_percent: riskPerTradePercent,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? `backtest ${res.status}`);
    await runTick();
  }, []);

  return {
    ...snap,
    tick: runTick,
    annotate,
    setHypothesis,
    setInstrument,
    resetExperiment,
    createExperiment,
    experimentAction,
    loadProfile,
    runBacktest,
  };
}
