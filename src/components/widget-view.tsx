'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
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
import { LazyChart } from './lazy-chart';
import { TokenBar } from './token-bar';
import { LabWidget, isLabSlug } from './lab-widgets';
import { WidgetMenu } from './widget-menu';
import { hint, page } from './styles';

function paneStatus(
  token: TokenStatus,
  loading: boolean,
  error: TokenStatus | undefined,
  hasData: boolean,
): TokenStatus {
  if (token === 'no_token' || token === 'subscription_expired' || token === 'connecting') return token;
  if (hasData) return 'ok';
  if (error) return error;
  if (loading) return 'connecting';
  return token;
}

const InitialToken = createContext<TokenStatus>('no_token');

function useShell(slug: WidgetSlug) {
  const { bridge } = useBridge(extensionIdFor(slug));
  const universe = useUniverse();
  const isPublisher = slug === 'filter' || slug === 'dashboard';
  const filterState = useFutoiFilter(bridge, { publish: isPublisher, universe });
  const token = useTokenGate(useContext(InitialToken));
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
  const { rootRef, universe, filter, unsupported, setSecid, setLookback, setSessionDate, token } = useShell('filter');
  return (
    <div ref={rootRef}>
      <TokenBar status={token.status} onConnect={token.connect} onDisconnect={token.disconnect} />
      {token.ready ? (
        unsupported ? (
          <p style={hint}>Для инструмента {unsupported} FUTOI нет</p>
        ) : (
          <FutoiFilter
            secid={filter.secid}
            universe={universe}
            lookback={filter.lookback ?? '5d'}
            sessionDate={filter.sessionDate}
            onSecid={setSecid}
            onLookback={setLookback}
            onSessionDate={setSessionDate}
          />
        )
      ) : null}
    </div>
  );
}

function TableWidget() {
  const { rootRef, filter, unsupported, token } = useShell('table');
  const { data, loading, error, reload } = useFutoiSnapshot(filter.secid, token.ready);
  const pane = paneStatus(token.status, loading, error, Boolean(data?.current));
  return (
    <div ref={rootRef}>
      <TokenBar status={token.status} onConnect={token.connect} onDisconnect={token.disconnect} />
      {unsupported ? <p style={hint}>Для инструмента {unsupported} FUTOI нет</p> : null}
      {token.ready ? (
        <>
          <ChartState status={pane === 'ok' ? 'ok' : pane} onRetry={reload} />
          {pane === 'ok' ? <FutoiTable data={data} /> : null}
        </>
      ) : null}
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
  const { points, loading, loadingDays, progress, error, stale, reload, ensureRange, loadDay } = useFutoiSeries(
    filter,
    token.ready,
  );
  const hasSeries = points.length > 0 || loadingDays.length > 0;
  const pane = paneStatus(token.status, loading, error, hasSeries);
  return (
    <div ref={rootRef}>
      <TokenBar status={token.status} onConnect={token.connect} onDisconnect={token.disconnect} />
      {unsupported ? <p style={hint}>Для инструмента {unsupported} FUTOI нет</p> : null}
      {token.ready ? (
        <>
          {hasSeries ? (
            <FutoiChart
              kind={kind}
              group={group}
              points={points}
              stale={stale}
              secid={filter.secid}
              loadingDays={loadingDays}
              progress={progress}
              focusDate={filter.sessionDate}
              onVisibleRange={ensureRange}
              onNeedOlder={loadDay}
            />
          ) : (
            <ChartState status={pane === 'ok' ? 'ok' : pane} onRetry={reload} />
          )}
        </>
      ) : null}
    </div>
  );
}

function DashboardWidget() {
  const { rootRef, universe, filter, unsupported, setSecid, setLookback, setSessionDate, token } = useShell('dashboard');
  const { snapshot, points, loading, loadingDays, progress, error, stale, reload, ensureRange, loadDay } = useFutoiBundle(
    filter,
    token.ready,
  );
  const pane = paneStatus(
    token.status,
    loading,
    error,
    Boolean(snapshot?.current) || points.length > 0 || loadingDays.length > 0,
  );
  return (
    <div ref={rootRef}>
      <TokenBar status={token.status} onConnect={token.connect} onDisconnect={token.disconnect} />
      {token.ready ? (
        <>
          {unsupported ? <p style={hint}>Для инструмента {unsupported} FUTOI нет</p> : null}
          <FutoiFilter
            secid={filter.secid}
            universe={universe}
            lookback={filter.lookback ?? '5d'}
            sessionDate={filter.sessionDate}
            progress={progress}
            onSecid={setSecid}
            onLookback={setLookback}
            onSessionDate={setSessionDate}
          />
          {unsupported ? null : points.length > 0 || loadingDays.length > 0 ? (
            <>
              {snapshot ? <FutoiTable data={snapshot} /> : null}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <LazyChart kind="long-short" group="FIZ" points={points} stale={stale} eager secid={filter.secid} loadingDays={loadingDays} progress={progress} focusDate={filter.sessionDate} onVisibleRange={ensureRange} onNeedOlder={loadDay} />
                <LazyChart kind="long-short" group="YUR" points={points} stale={stale} eager secid={filter.secid} loadingDays={loadingDays} progress={progress} focusDate={filter.sessionDate} onVisibleRange={ensureRange} onNeedOlder={loadDay} />
                <LazyChart kind="persons" group="FIZ" points={points} stale={stale} secid={filter.secid} loadingDays={loadingDays} progress={progress} focusDate={filter.sessionDate} onVisibleRange={ensureRange} onNeedOlder={loadDay} />
                <LazyChart kind="persons" group="YUR" points={points} stale={stale} secid={filter.secid} loadingDays={loadingDays} progress={progress} focusDate={filter.sessionDate} onVisibleRange={ensureRange} onNeedOlder={loadDay} />
                <LazyChart kind="oi" group="FIZ" points={points} stale={stale} secid={filter.secid} loadingDays={loadingDays} progress={progress} focusDate={filter.sessionDate} onVisibleRange={ensureRange} onNeedOlder={loadDay} />
                <LazyChart kind="oi" group="YUR" points={points} stale={stale} secid={filter.secid} loadingDays={loadingDays} progress={progress} focusDate={filter.sessionDate} onVisibleRange={ensureRange} onNeedOlder={loadDay} />
                <LazyChart kind="directed" group="FIZ" points={points} stale={stale} secid={filter.secid} loadingDays={loadingDays} progress={progress} focusDate={filter.sessionDate} onVisibleRange={ensureRange} onNeedOlder={loadDay} />
                <LazyChart kind="directed" group="YUR" points={points} stale={stale} secid={filter.secid} loadingDays={loadingDays} progress={progress} focusDate={filter.sessionDate} onVisibleRange={ensureRange} onNeedOlder={loadDay} />
              </div>
            </>
          ) : (
            <ChartState status={pane === 'ok' ? 'ok' : pane} onRetry={reload} />
          )}
        </>
      ) : null}
    </div>
  );
}

export function WidgetView({ slug, tokenStatus = 'no_token' }: { slug: WidgetSlug; tokenStatus?: TokenStatus }) {
  if (isLabSlug(slug)) {
    return (
      <div style={page}>
        <WidgetMenu current={slug} />
        <LabWidget slug={slug} />
      </div>
    );
  }
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

  return (
    <InitialToken.Provider value={tokenStatus}>
      <div style={page}>
        <WidgetMenu current={slug} />
        {body}
      </div>
    </InitialToken.Provider>
  );
}
