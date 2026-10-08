'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadBrowserSeries, loadBrowserSnapshot } from '@/lib/moex-browser';
import { dataUrl, STATIC } from '@/lib/static-mode';
import { readLocalToken } from '@/lib/token-local';
import {
  POLL_MS,
  type FutoiFilterPayload,
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

export function useUniverse(): UniverseItem[] {
  const [items, setItems] = useState<UniverseItem[]>([]);
  useEffect(() => {
    void fetch(STATIC ? dataUrl('universe.json') : '/api/futoi/universe')
      .then((r) => r.json())
      .then((d: { items?: UniverseItem[] }) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  }, []);
  return items;
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
    if (!secid || !enabled) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        if (STATIC) {
          const live = await loadBrowserSnapshot(secid, readLocalToken());
          if (cancelled) return;
          if (live.error === 'subscription_expired') {
            setError('subscription_expired');
            setLoading(false);
            return;
          }
          if (live.snapshot) {
            setError(undefined);
            setData(live.snapshot);
            setLoading(false);
            return;
          }
          const res = await fetch(dataUrl(`snapshot-${secid}.json`));
          const json = (await res.json()) as SnapshotResponse;
          if (cancelled) return;
          setError(undefined);
          setData({ ...json, stale: true });
          setLoading(false);
          return;
        }
        const res = await fetch(`/api/futoi/snapshot?secid=${encodeURIComponent(secid)}`);
        const json = (await res.json()) as SnapshotResponse & { error?: TokenStatus };
        if (cancelled) return;
        const kind = readError(json, res.status);
        if (kind) {
          setError(kind);
          setLoading(false);
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
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [secid, enabled, tick]);

  return { data, loading, error, reload };
}

export function useFutoiSeries(filter: FutoiFilterPayload, enabled: boolean): {
  points: SeriesPoint[];
  loading: boolean;
  error?: TokenStatus;
  stale?: boolean;
  reload: () => void;
} {
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<TokenStatus>();
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!filter.secid || !enabled) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const q = new URLSearchParams({
        secid: filter.secid,
        lookback: filter.lookback ?? 'session',
      });
      if (filter.sessionDate) q.set('sessionDate', filter.sessionDate);
      try {
        if (STATIC) {
          const live = await loadBrowserSeries(filter.secid, readLocalToken());
          if (cancelled) return;
          if (live.error === 'subscription_expired') {
            setError('subscription_expired');
            setLoading(false);
            return;
          }
          if (live.points.length) {
            setError(undefined);
            setStale(false);
            setPoints(live.points);
            setLoading(false);
            return;
          }
          const res = await fetch(dataUrl(`series-${filter.secid}.json`));
          const json = (await res.json()) as { points?: SeriesPoint[]; stale?: boolean };
          if (cancelled) return;
          setError(undefined);
          setStale(true);
          setPoints(json.points ?? []);
          setLoading(false);
          return;
        }
        const res = await fetch(`/api/futoi/series?${q}`);
        const json = (await res.json()) as { points?: SeriesPoint[]; stale?: boolean; error?: TokenStatus };
        if (cancelled) return;
        const kind = readError(json, res.status);
        if (kind) {
          setError(kind);
          setLoading(false);
          return;
        }
        setError(undefined);
        setStale(Boolean(json.stale));
        setPoints(json.points ?? []);
      } catch {
        if (!cancelled) setError('upstream_error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [filter.secid, filter.lookback, filter.sessionDate, enabled, tick]);

  return { points, loading, error, stale, reload };
}

export function useFutoiBundle(filter: FutoiFilterPayload, enabled: boolean): {
  snapshot: SnapshotResponse | null;
  points: SeriesPoint[];
  loading: boolean;
  error?: TokenStatus;
  stale?: boolean;
  reload: () => void;
} {
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [bundleStale, setBundleStale] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<TokenStatus>();
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!filter.secid || !enabled) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const q = new URLSearchParams({
        secid: filter.secid,
        lookback: filter.lookback ?? 'session',
      });
      if (filter.sessionDate) q.set('sessionDate', filter.sessionDate);
      try {
        let snapshot: SnapshotResponse | null = null;
        let points: SeriesPoint[] = [];
        let stale = false;
        if (STATIC) {
          const token = readLocalToken();
          const [liveSnap, liveSeries] = await Promise.all([
            loadBrowserSnapshot(filter.secid, token),
            loadBrowserSeries(filter.secid, token),
          ]);
          if (liveSnap.error === 'subscription_expired' || liveSeries.error === 'subscription_expired') {
            if (!cancelled) {
              setError('subscription_expired');
              setLoading(false);
            }
            return;
          }
          if (liveSnap.snapshot && liveSeries.points.length) {
            snapshot = liveSnap.snapshot;
            points = liveSeries.points;
            stale = false;
          } else {
            const [snapRes, seriesRes] = await Promise.all([
              fetch(dataUrl(`snapshot-${filter.secid}.json`)),
              fetch(dataUrl(`series-${filter.secid}.json`)),
            ]);
            snapshot = (await snapRes.json()) as SnapshotResponse;
            const series = (await seriesRes.json()) as { points?: SeriesPoint[]; stale?: boolean };
            points = series.points ?? [];
            stale = true;
          }
        } else {
          const res = await fetch(`/api/futoi/bundle?${q}`);
          const json = (await res.json()) as {
            snapshot?: SnapshotResponse;
            series?: { points?: SeriesPoint[]; stale?: boolean };
            error?: TokenStatus;
          };
          const kind = readError(json, res.status);
          if (kind) {
            if (!cancelled) {
              setError(kind);
              setLoading(false);
            }
            return;
          }
          snapshot = json.snapshot ?? null;
          points = json.series?.points ?? [];
          stale = Boolean(json.series?.stale || json.snapshot?.stale);
        }
        if (cancelled) return;
        setError(undefined);
        setSnapshot(snapshot);
        setPoints(points);
        setBundleStale(stale);
      } catch {
        if (!cancelled) setError('upstream_error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [filter.secid, filter.lookback, filter.sessionDate, enabled, tick]);

  return { snapshot, points, loading, error, stale: bundleStale, reload };
}
