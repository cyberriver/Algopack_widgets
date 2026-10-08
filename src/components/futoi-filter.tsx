'use client';

import { hint } from './styles';
import { formatDayRu, moscowToday } from '@/lib/range-load';
import { HISTORY_FLOOR, type LoadProgress, type Lookback, type UniverseItem } from '@/lib/types';

export function FutoiFilter({
  secid,
  universe,
  lookback,
  sessionDate,
  progress,
  onSecid,
  onLookback,
  onSessionDate,
}: {
  secid: string;
  universe: UniverseItem[];
  lookback: Lookback;
  sessionDate?: string;
  progress?: LoadProgress;
  onSecid: (secid: string) => void;
  onLookback?: (lookback: Lookback) => void;
  onSessionDate?: (date: string) => void;
}) {
  const chips = universe.length ? universe : [{ secid: 'Si', assetName: 'Si' }];
  const extra = chips.length > 8;
  const shown = extra ? chips.slice(0, 8) : chips;
  const rest = extra ? chips.slice(8) : [];
  const dateValue = sessionDate || moscowToday();
  const wait = progress && progress.total > progress.done;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {shown.map((item) => {
          const on = item.secid.toLowerCase() === secid.toLowerCase();
          return (
            <button
              key={item.secid}
              type="button"
              onClick={() => onSecid(item.secid)}
              style={{
                border: `1px solid ${on ? 'var(--color-primary, #1A9B8E)' : 'var(--color-border, #D5DBE5)'}`,
                background: on ? 'var(--color-primary, #1A9B8E)' : 'var(--color-muted, #E8ECF1)',
                color: on ? '#FFFFFF' : 'var(--color-foreground, #0B1220)',
                borderRadius: 6,
                padding: '6px 10px',
                fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {item.secid}
            </button>
          );
        })}
        {rest.length > 0 ? (
          <select
            value={rest.some((r) => r.secid === secid) ? secid : ''}
            onChange={(e) => e.target.value && onSecid(e.target.value)}
            style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6 }}
          >
            <option value="">ещё инструменты</option>
            {rest.map((item) => (
              <option key={item.secid} value={item.secid}>
                {item.secid}
              </option>
            ))}
          </select>
        ) : null}
        {onSessionDate ? (
          <input
            type="date"
            value={dateValue}
            min={HISTORY_FLOOR}
            max={moscowToday()}
            onChange={(e) => e.target.value && onSessionDate(e.target.value)}
            style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6 }}
          />
        ) : null}
        {onLookback ? (
          <select
            value={lookback}
            onChange={(e) => onLookback(e.target.value as Lookback)}
            style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 8px', borderRadius: 6 }}
          >
            <option value="5d">10 мин · 5 дней</option>
            <option value="20d">10 мин · 20 дней</option>
            <option value="60d">10 мин · 60 дней</option>
            <option value="session">1 день</option>
          </select>
        ) : null}
      </div>
      <p style={hint}>
        {wait
          ? `Загрузка ${progress.current ? formatDayRu(progress.current) : ''} · ${progress.done} из ${progress.total} дней · осталось ~${progress.etaSec} с`
          : 'Колесо — масштаб. Сдвиг влево догружает историю без отсечки. Можно выбрать дату с 2019.'}
      </p>
    </div>
  );
}
