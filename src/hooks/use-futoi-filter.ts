'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  setSessionDate: (sessionDate: string) => void;
} {
  const [filter, setFilter] = useState<FutoiFilterPayload>({
    secid: DEFAULT_SECID,
    lookback: '5d',
  });
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const universe = opts.universe;
  const canPublish = opts.publish ?? false;
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const known = useCallback(
    (secid: string) =>
      universe.length === 0 || universe.some((u) => u.secid.toLowerCase() === secid.toLowerCase()),
    [universe],
  );

  const apply = useCallback(
    (next: FutoiFilterPayload, publishIt: boolean) => {
      setFilter(next);
      if (!publishIt || !bridge) return;
      bridge.context.publish(FILTER_TOPIC, next);
      bridge.context.publish('fdc3.instrument', {
        type: 'fdc3.instrument',
        id: { ticker: next.secid },
        name: next.assetName,
      });
    },
    [bridge],
  );

  useEffect(() => {
    if (!bridge) return;
    const unsubFilter = bridge.context.subscribe(FILTER_TOPIC, (payload) => {
      const p = payload as FutoiFilterPayload;
      if (!p?.secid) return;
      if (p.secid === filterRef.current.secid && p.lookback === filterRef.current.lookback && p.sessionDate === filterRef.current.sessionDate) {
        return;
      }
      setUnsupported(null);
      setFilter({
        secid: p.secid,
        assetName: p.assetName,
        sessionDate: p.sessionDate,
        lookback: p.lookback ?? '5d',
      });
    });
    const unsubInst = bridge.context.subscribe('fdc3.instrument', (payload) => {
      const ticker = (payload as HostInstrument | null)?.id?.ticker?.trim();
      if (!ticker) return;
      if (ticker.toLowerCase() === filterRef.current.secid.toLowerCase()) return;
      if (!known(ticker)) {
        setUnsupported(ticker);
        return;
      }
      setUnsupported(null);
      apply({ ...filterRef.current, secid: ticker }, false);
    });
    return () => {
      unsubFilter();
      unsubInst();
    };
  }, [bridge, apply, known]);

  const setSecid = (secid: string) => {
    if (secid.toLowerCase() === filterRef.current.secid.toLowerCase()) return;
    const item = universe.find((u) => u.secid.toLowerCase() === secid.toLowerCase());
    apply(
      { ...filterRef.current, secid, assetName: item?.assetName, lookback: filterRef.current.lookback ?? '5d' },
      true,
    );
    setUnsupported(null);
  };

  const setLookback = (lookback: Lookback) => {
    if (lookback === filterRef.current.lookback) return;
    apply({ ...filterRef.current, lookback }, canPublish);
  };

  const setSessionDate = (sessionDate: string) => {
    if (sessionDate === filterRef.current.sessionDate) return;
    apply({ ...filterRef.current, sessionDate }, canPublish);
  };

  return { filter, unsupported, setSecid, setLookback, setSessionDate };
}
