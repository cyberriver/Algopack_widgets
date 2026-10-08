'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiPath } from '@/lib/api-base';
import { fetchBakedSeries, fetchBakedSnapshot } from '@/lib/fast-load';
import { dataUrl, STATIC } from '@/lib/static-mode';
import { authHeaders } from '@/lib/token-local';
import {
  addDays,
  enumerateDays,
  fetchDaySeries,
  mergePoints,
  moscowToday,
} from '@/lib/range-load';
import {
  ASSET_NAMES,
  DEFAULT_UNIVERSE,
  HISTORY_FLOOR,
  POLL_MS,
  type FutoiFilterPayload,
  type LoadProgress,
  type Lookback,
  type SeriesPoint,
  type SnapshotResponse,
  type TokenStatus,
  type UniverseItem,
} from '@/lib/types';

function readError(json: { error?: string }, http: number): TokenStatus | undefined {
  if (json.error === 'no_token' || http === 401) return json.error === 'subscription_expired' ? 'subscription_expired' : 'no_token';
  if (json.error === 'subscription_expired' || http === 403) return 'subscription_expired';
  if (json.error === 'upstream_error' || http >= 500) return 'upstream_error';
  return undefined;
}

const defaultUniverse: UniverseItem[] = DEFAULT_UNIVERSE.map((secid) => ({
  secid,
  assetName: ASSET_NAMES[secid] ?? secid,
}));

export function useUniverse(): UniverseItem[] {
  const [items, setItems] = useState<UniverseItem[]>(defaultUniverse);
  useEffect(() => {
    void fetch(STATIC ? dataUrl('universe.json') : apiPath('/api/futoi/universe'))
      .then((r) => r.json())
      .then((d: { items?: UniverseItem[] }) => {
        if (d.items?.length) setItems(d.items);
      })
      .catch(() => undefined);
  }, []);
  return items;
}

const PUMP_CONCURRENCY = 3;

function lookbackSpan(lookback: Lookback | undefined): number {
  if (lookback === '60d') return 60;
  if (lookback === '20d') return 20;
  if (lookback === '5d') return 5;
  if (lookback === 'session') return 1;
  return 5;
}

export function useFutoiSnapshot(secid: string | undefined, enabled: boolean): {
  data: SnapshotResponse | null;
  loading: boolean;
  error?: TokenStatus;
  reload: () => void;
} {
  const [data, setData] = useState<SnapshotResponse | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<TokenStatus>();
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!secid || !enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    const hydrate = async () => {
      try {
        if (STATIC) {
          const baked = await fetchBakedSnapshot(secid);
          if (cancelled) return;
          if (baked) {
            setData(baked);
            setError(undefined);
          } else {
            setError('upstream_error');
          }
          return;
        }
        const res = await fetch(apiPath(`/api/futoi/snapshot?secid=${encodeURIComponent(secid)}&quick=1`), {
          headers: authHeaders(),
        });
        const json = (await res.json()) as SnapshotResponse & { error?: TokenStatus };
        if (cancelled) return;
        const kind = readError(json, res.status);
        if (kind) {
          setError(kind);
          return;
        }
        setError(undefined);
        setData(json);
      } catch {
        if (!cancelled) setError('upstream_error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void hydrate();
    const id = setInterval(() => void hydrate(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [secid, enabled, tick]);

  return { data, loading, error, reload };
}

function emptyProgress(): LoadProgress {
  return { done: 0, total: 0, etaSec: 0 };
}

export function useFutoiSeries(filter: FutoiFilterPayload, enabled: boolean): {
  points: SeriesPoint[];
  loading: boolean;
  loadingDays: string[];
  progress: LoadProgress;
  error?: TokenStatus;
  stale?: boolean;
  reload: () => void;
  ensureRange: (from: string, to: string) => void;
  loadDay: (date: string) => void;
} {
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [loadingDays, setLoadingDays] = useState<string[]>([]);
  const [progress, setProgress] = useState<LoadProgress>(emptyProgress);
  const [error, setError] = useState<TokenStatus>();
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  const dayState = useRef(new Map<string, 'partial' | 'full' | 'loading'>());
  const queue = useRef<string[]>([]);
  const pumping = useRef(false);
  const secidRef = useRef(filter.secid);
  const cancelledRef = useRef(false);
  const resetKeyRef = useRef('');
  const avgMs = useRef(4000);
  const doneCount = useRef(0);

  const publishProgress = useCallback((current?: string) => {
    const loadingN = [...dayState.current.values()].filter((s) => s === 'loading').length;
    const queued = queue.current.length;
    const remaining = loadingN + queued;
    const total = doneCount.current + remaining;
    setLoadingDays([...dayState.current].filter(([, s]) => s === 'loading').map(([d]) => d));
    setProgress({
      current,
      done: doneCount.current,
      total,
      etaSec: Math.max(0, Math.round((remaining * avgMs.current) / 1000)),
    });
  }, []);

  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    const secid = secidRef.current;
    while (queue.current.length && !cancelledRef.current && secidRef.current === secid) {
      const batch: string[] = [];
      while (batch.length < PUMP_CONCURRENCY && queue.current.length) {
        const day = queue.current.shift();
        if (!day) break;
        const prev = dayState.current.get(day);
        if (prev === 'full' || prev === 'loading') continue;
        dayState.current.set(day, 'loading');
        batch.push(day);
      }
      if (!batch.length) break;
      publishProgress(batch[0]);
      const started = Date.now();
      const results = await Promise.all(
        batch.map(async (day) => {
          try {
            return { day, result: await fetchDaySeries(secid, day) };
          } catch (err) {
            return { day, err };
          }
        }),
      );
      avgMs.current = Math.round(avgMs.current * 0.6 + ((Date.now() - started) / batch.length) * 0.4);
      if (cancelledRef.current || secidRef.current !== secid) break;

      let incoming: SeriesPoint[] = [];
      for (const item of results) {
        if ('err' in item && item.err) {
          dayState.current.delete(item.day);
          if (item.err instanceof Error && item.err.name === 'MoexAuth') setError('subscription_expired');
          else setError('upstream_error');
          continue;
        }
        const result = 'result' in item ? item.result : undefined;
        if (!result) continue;
        if (result.points.length) {
          incoming = mergePoints(incoming, result.points);
          setStale(Boolean(result.stale));
          setError(undefined);
        } else {
          const older = addDays(item.day, -1);
          if (older >= HISTORY_FLOOR && !dayState.current.has(older) && !queue.current.includes(older)) {
            queue.current.push(older);
          }
        }
        dayState.current.set(item.day, 'full');
        doneCount.current += 1;
      }
      if (incoming.length) setPoints((cur) => mergePoints(cur, incoming));
      setLoading(false);
      publishProgress(queue.current[0]);
    }
    pumping.current = false;
    if (queue.current.length && !cancelledRef.current) void pump();
  }, [publishProgress]);

  const enqueue = useCallback(
    (days: string[]) => {
      for (const day of days) {
        if (day < HISTORY_FLOOR || day > moscowToday()) continue;
        const state = dayState.current.get(day);
        if (state === 'full' || state === 'loading') continue;
        if (!queue.current.includes(day)) queue.current.push(day);
      }
      publishProgress(queue.current[0]);
      void pump();
    },
    [pump, publishProgress],
  );

  const ensureRange = useCallback(
    (from: string, to: string) => {
      enqueue(enumerateDays(from, to, 90));
    },
    [enqueue],
  );

  const loadDay = useCallback(
    (date: string) => {
      if (!date) return;
      enqueue(enumerateDays(addDays(date, -6), date, 7));
    },
    [enqueue],
  );

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, [filter.secid, tick, enabled]);

  useEffect(() => {
    if (!filter.secid || !enabled) {
      setLoading(false);
      return;
    }
    if (STATIC) {
      let cancelled = false;
      setLoading(true);
      setError(undefined);
      void fetchBakedSeries(filter.secid).then((result) => {
        if (cancelled) return;
        setPoints(result.points);
        setStale(Boolean(result.stale));
        setLoading(false);
        setLoadingDays([]);
        setProgress(emptyProgress());
      });
      return () => {
        cancelled = true;
      };
    }
    cancelledRef.current = false;
    secidRef.current = filter.secid;
    const resetKey = `${filter.secid}:${tick}`;
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      dayState.current = new Map();
      queue.current = [];
      pumping.current = false;
      doneCount.current = 0;
      setPoints([]);
      setLoadingDays([]);
      setProgress(emptyProgress());
      setLoading(true);
      setStale(false);
      setError(undefined);
    }

    const today = moscowToday();
    const extra = lookbackSpan(filter.lookback);
    enqueue(extra > 0 ? enumerateDays(addDays(today, -extra), today) : [today]);

    const id = setInterval(() => {
      dayState.current.delete(moscowToday());
      enqueue([moscowToday()]);
    }, POLL_MS);

    return () => {
      clearInterval(id);
    };
  }, [filter.secid, filter.lookback, enabled, tick, enqueue]);

  useEffect(() => {
    if (!filter.sessionDate || !enabled) return;
    enqueue([filter.sessionDate]);
  }, [filter.sessionDate, enabled, enqueue]);

  return { points, loading, loadingDays, progress, error, stale, reload, ensureRange, loadDay };
}

export function useFutoiBundle(filter: FutoiFilterPayload, enabled: boolean): {
  snapshot: SnapshotResponse | null;
  points: SeriesPoint[];
  loading: boolean;
  loadingDays: string[];
  progress: LoadProgress;
  error?: TokenStatus;
  stale?: boolean;
  reload: () => void;
  ensureRange: (from: string, to: string) => void;
  loadDay: (date: string) => void;
} {
  const snap = useFutoiSnapshot(filter.secid, enabled);
  const series = useFutoiSeries(filter, enabled);
  const reloadSnap = snap.reload;
  const reloadSeries = series.reload;
  const reload = useCallback(() => {
    reloadSnap();
    reloadSeries();
  }, [reloadSnap, reloadSeries]);
  return {
    snapshot: snap.data,
    points: series.points,
    loading: snap.loading || series.loading,
    loadingDays: series.loadingDays,
    progress: series.progress,
    error: snap.error ?? series.error,
    stale: series.stale,
    reload,
    ensureRange: series.ensureRange,
    loadDay: series.loadDay,
  };
}
