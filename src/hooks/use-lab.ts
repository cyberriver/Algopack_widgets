'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiPath } from '@/lib/api-base';
import type {
  Annotation,
  HypothesisId,
  HypothesisRow,
  HypothesisStatus,
  LabEvent,
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
  last_tick_at: string | null;
  last_futoi_ok_at: string | null;
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

export function useLab(pollMs = 30_000) {
  const [data, setData] = useState<LabPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tick = useCallback(async () => {
    try {
      const res = await fetch(apiPath('/api/lab/tick'), { method: 'POST' });
      if (!res.ok) throw new Error(`tick ${res.status}`);
      setData((await res.json()) as LabPayload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

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
      setData((prev) => (prev ? { ...prev, annotations: { ...prev.annotations, [eventId]: annotation } } : prev));
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
    setData((prev) => (prev ? { ...prev, hypotheses: { ...prev.hypotheses, [id]: hypothesis } } : prev));
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

  useEffect(() => {
    void tick();
    const id = setInterval(() => void tick(), pollMs);
    return () => clearInterval(id);
  }, [tick, pollMs]);

  return { data, loading, error, tick, annotate, setHypothesis, setInstrument };
}
