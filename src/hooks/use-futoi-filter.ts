'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ExtensionBridge } from '@finamx/extension-sdk';
import {
  DEFAULT_SECID,
  FILTER_TOPIC,
  type FutoiFilterPayload,
  type Lookback,
  type UniverseItem,
} from '@/lib/types';

type HostInstrument = {
  type?: string;
  id?: { ticker?: string };
};

export function useFutoiFilter(
  bridge: ExtensionBridge | null,
  opts: { publish?: boolean; universe: UniverseItem[] } = { universe: [] },
): {
  filter: FutoiFilterPayload;
  unsupported: string | null;
  setSecid: (secid: string) => void;
  setLookback: (lookback: Lookback) => void;
} {
  const [filter, setFilter] = useState<FutoiFilterPayload>({
    secid: DEFAULT_SECID,
    lookback: 'session',
  });
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const universe = opts.universe;
  const canPublish = opts.publish ?? false;

  const known = useCallback(
    (secid: string) =>
      universe.length === 0 || universe.some((u) => u.secid.toLowerCase() === secid.toLowerCase()),
    [universe],
  );

  const apply = useCallback(
    (next: FutoiFilterPayload, publishIt: boolean) => {
      setFilter(next);
      if (publishIt && bridge) {
        bridge.context.publish(FILTER_TOPIC, next);
        bridge.context.publish('fdc3.instrument', {
          type: 'fdc3.instrument',
          id: { ticker: next.secid },
          name: next.assetName,
        });
      }
    },
    [bridge],
  );

  useEffect(() => {
    if (!bridge) return;
    const unsubFilter = bridge.context.subscribe(FILTER_TOPIC, (payload) => {
      const p = payload as FutoiFilterPayload;
      if (!p?.secid) return;
      setUnsupported(null);
      setFilter({
        secid: p.secid,
        assetName: p.assetName,
        sessionDate: p.sessionDate,
        lookback: p.lookback ?? 'session',
      });
    });
    const unsubInst = bridge.context.subscribe('fdc3.instrument', (payload) => {
      const ticker = (payload as HostInstrument | null)?.id?.ticker?.trim();
      if (!ticker) return;
      if (!known(ticker)) {
        setUnsupported(ticker);
        return;
      }
      setUnsupported(null);
      const next = { ...filter, secid: ticker };
      apply(next, canPublish);
    });
    const unsubTf = bridge.context.subscribe('finamx.timeframe', (payload) => {
      const tf = payload as { from?: string; to?: string };
      if (!tf?.from && !tf?.to) return;
      const sessionDate = tf.to?.slice(0, 10) || tf.from?.slice(0, 10);
      setFilter((prev) => ({ ...prev, sessionDate }));
    });
    return () => {
      unsubFilter();
      unsubInst();
      unsubTf();
    };
  }, [bridge, apply, canPublish, filter, known]);

  const setSecid = (secid: string) => {
    const item = universe.find((u) => u.secid.toLowerCase() === secid.toLowerCase());
    apply(
      { ...filter, secid, assetName: item?.assetName, lookback: filter.lookback ?? 'session' },
      true,
    );
    setUnsupported(null);
  };

  const setLookback = (lookback: Lookback) => {
    apply({ ...filter, lookback }, canPublish);
  };

  return { filter, unsupported, setSecid, setLookback };
}
