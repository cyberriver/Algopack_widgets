'use client';

import type { TokenStatus } from '@/lib/types';
import { eyebrow, pane, secondaryBtn } from './styles';

export function ChartState({
  status,
  onRetry,
}: {
  status: TokenStatus;
  onRetry?: () => void;
}) {
  if (status === 'ok' || status === 'no_token') return null;
  return (
    <div style={{ ...pane, flexDirection: 'column', gap: 12, textAlign: 'center' }}>
      {status === 'connecting' ? (
        <>
          <div
            aria-hidden
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: '2px solid var(--color-border)',
              borderTopColor: 'var(--color-primary)',
              animation: 'futoi-spin 0.8s linear infinite',
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--color-muted-foreground)' }}>
            Загрузка с Мосбиржи
          </span>
        </>
      ) : null}
      {status === 'subscription_expired' ? (
        <>
          <span style={eyebrow}>Подписка</span>
          <p style={{ margin: 0, fontSize: 14 }}>Подписка ALGOPACK закончилась</p>
        </>
      ) : null}
      {status === 'upstream_error' ? (
        <>
          <span style={eyebrow}>Сбой</span>
          <p style={{ margin: 0, fontSize: 14 }}>MOEX сейчас недоступен</p>
          <button type="button" style={secondaryBtn} onClick={onRetry}>
            Повторить
          </button>
        </>
      ) : null}
    </div>
  );
}
