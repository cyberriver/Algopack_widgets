'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { setupEmbedShell } from '@finamx/extension-sdk';
import { useBridge } from '@/hooks/use-bridge';
import { useFutoiBundle, useFutoiSeries, useFutoiSnapshot, useUniverse } from '@/hooks/use-futoi-data';
import { useFutoiFilter } from '@/hooks/use-futoi-filter';
import { useHostTokens } from '@/hooks/use-tokens';
import { useTokenGate } from '@/hooks/use-token';
import { extensionIdFor, type TokenStatus, type WidgetSlug } from '@/lib/types';
import { ChartState } from './chart-state';
import { FutoiChart, type ChartKind } from './futoi-chart';
import { FutoiFilter } from './futoi-filter';
import { FutoiTable } from './futoi-table';
import { TokenModal } from './token-modal';
import { hint, page } from './styles';

function paneStatus(
  token: TokenStatus,
  loading: boolean,
  error: TokenStatus | undefined,
  hasData: boolean,
): TokenStatus {
  if (token === 'no_token' || token === 'subscription_expired' || token === 'connecting') return token;
  if (error) return error;
  if (loading && !hasData) return 'connecting';
  return 'ok';
}

function useShell(slug: WidgetSlug) {
  const { bridge } = useBridge(extensionIdFor(slug));
  const universe = useUniverse();
  const isPublisher = slug === 'filter' || slug === 'dashboard';
  const filterState = useFutoiFilter(bridge, { publish: isPublisher, universe });
  const token = useTokenGate();
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const rootRef = useCallback((node: HTMLDivElement | null) => setRootEl(node), []);
  useHostTokens(bridge, rootEl);
  useEffect(() => {
    if (!bridge || !rootEl) return;
    return setupEmbedShell(bridge, rootEl);
  }, [bridge, rootEl]);
  return { rootRef, universe, token, ...filterState };
}

function FilterWidget() {
  const { rootRef, universe, filter, unsupported, setSecid, setLookback } = useShell('filter');
  return (
    <div ref={rootRef}>
      {unsupported ? (
        <p style={hint}>Для инструмента {unsupported} FUTOI нет</p>
      ) : (
        <FutoiFilter
          secid={filter.secid}
          universe={universe}
          lookback={filter.lookback ?? 'session'}
          onSecid={setSecid}
          onLookback={setLookback}
        />
      )}
    </div>
  );
}

function TableWidget() {
  const { rootRef, filter, unsupported, token } = useShell('table');
  const enabled = token.status === 'ok';
  const { data, loading, error, reload } = useFutoiSnapshot(filter.secid, enabled);
  const pane = paneStatus(token.status, loading, error, Boolean(data?.current));
  return (
    <div ref={rootRef}>
      {unsupported ? (
        <p style={hint}>Для инструмента {unsupported} FUTOI нет</p>
      ) : (
        <>
          <ChartState status={pane} onConnect={() => token.setOpen(true)} onRetry={reload} />
          {pane === 'ok' ? <FutoiTable data={data} /> : null}
        </>
      )}
      <TokenModal open={token.open} onClose={() => token.setOpen(false)} onSubmit={token.connect} />
    </div>
  );
}

function ChartWidget({
  slug,
  kind,
  group,
}: {
  slug: WidgetSlug;
  kind: ChartKind;
  group: 'FIZ' | 'YUR';
}) {
  const { rootRef, filter, unsupported, token } = useShell(slug);
  const enabled = token.status === 'ok';
  const { points, loading, error, stale, reload } = useFutoiSeries(filter, enabled);
  const pane = paneStatus(token.status, loading, error, points.length > 0);
  return (
    <div ref={rootRef}>
      {unsupported ? (
        <p style={hint}>Для инструмента {unsupported} FUTOI нет</p>
      ) : (
        <>
          <ChartState status={pane} onConnect={() => token.setOpen(true)} onRetry={reload} />
          {pane === 'ok' ? <FutoiChart kind={kind} group={group} points={points} stale={stale} /> : null}
        </>
      )}
      <TokenModal open={token.open} onClose={() => token.setOpen(false)} onSubmit={token.connect} />
    </div>
  );
}

function DashboardWidget() {
  const { rootRef, universe, filter, unsupported, setSecid, setLookback, token } = useShell('dashboard');
  const enabled = token.status === 'ok';
  const { snapshot, points, loading, error, stale, reload } = useFutoiBundle(filter, enabled);
  const pane = paneStatus(token.status, loading, error, Boolean(snapshot?.current) || points.length > 0);
  return (
    <div ref={rootRef}>
      {unsupported ? <p style={hint}>Для инструмента {unsupported} FUTOI нет</p> : null}
      <FutoiFilter
        secid={filter.secid}
        universe={universe}
        lookback={filter.lookback ?? 'session'}
        onSecid={setSecid}
        onLookback={setLookback}
      />
      {unsupported ? null : (
        <>
          <ChartState status={pane} onConnect={() => token.setOpen(true)} onRetry={reload} />
          {pane === 'ok' ? (
            <>
              <FutoiTable data={snapshot} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <FutoiChart kind="long-short" group="FIZ" points={points} stale={stale} />
                <FutoiChart kind="long-short" group="YUR" points={points} stale={stale} />
                <FutoiChart kind="persons" group="FIZ" points={points} stale={stale} />
                <FutoiChart kind="persons" group="YUR" points={points} stale={stale} />
                <FutoiChart kind="oi" group="FIZ" points={points} stale={stale} />
                <FutoiChart kind="oi" group="YUR" points={points} stale={stale} />
                <FutoiChart kind="directed" group="FIZ" points={points} stale={stale} />
                <FutoiChart kind="directed" group="YUR" points={points} stale={stale} />
              </div>
            </>
          ) : null}
        </>
      )}
      <TokenModal open={token.open} onClose={() => token.setOpen(false)} onSubmit={token.connect} />
    </div>
  );
}

export function WidgetView({ slug }: { slug: WidgetSlug }) {
  let body: ReactNode;
  if (slug === 'filter') body = <FilterWidget />;
  else if (slug === 'table') body = <TableWidget />;
  else if (slug === 'dashboard') body = <DashboardWidget />;
  else if (slug === 'long-short-fiz') body = <ChartWidget slug={slug} kind="long-short" group="FIZ" />;
  else if (slug === 'long-short-yur') body = <ChartWidget slug={slug} kind="long-short" group="YUR" />;
  else if (slug === 'persons-fiz') body = <ChartWidget slug={slug} kind="persons" group="FIZ" />;
  else if (slug === 'persons-yur') body = <ChartWidget slug={slug} kind="persons" group="YUR" />;
  else if (slug === 'oi-fiz') body = <ChartWidget slug={slug} kind="oi" group="FIZ" />;
  else if (slug === 'oi-yur') body = <ChartWidget slug={slug} kind="oi" group="YUR" />;
  else if (slug === 'directed-fiz') body = <ChartWidget slug={slug} kind="directed" group="FIZ" />;
  else body = <ChartWidget slug={slug} kind="directed" group="YUR" />;

  return <div style={page}>{body}</div>;
}
