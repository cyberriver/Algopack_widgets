'use client';

import { useEffect, useRef, useState } from 'react';
import { FutoiChart, type ChartKind } from './futoi-chart';
import type { ClGroup, LoadProgress, SeriesPoint } from '@/lib/types';

export function LazyChart({
  kind,
  group,
  points,
  stale,
  eager,
  secid,
  loadingDays,
  progress,
  focusDate,
  onVisibleRange,
  onNeedOlder,
}: {
  kind: ChartKind;
  group: ClGroup;
  points: SeriesPoint[];
  stale?: boolean;
  eager?: boolean;
  secid?: string;
  loadingDays?: string[];
  progress?: LoadProgress;
  focusDate?: string;
  onVisibleRange?: (from: string, to: string) => void;
  onNeedOlder?: (date: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(Boolean(eager));

  useEffect(() => {
    if (on || !ref.current) return;
    const node = ref.current;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { rootMargin: '80px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [on]);

  if (!on) {
    return <div ref={ref} style={{ minHeight: 260 }} />;
  }
  return (
    <FutoiChart
      kind={kind}
      group={group}
      points={points}
      stale={stale}
      secid={secid}
      loadingDays={loadingDays}
      progress={progress}
      focusDate={focusDate}
      onVisibleRange={onVisibleRange}
      onNeedOlder={onNeedOlder}
    />
  );
}
