'use client';

import type { TokenStatus } from '@/lib/types';
import { eyebrow, pane, primaryBtn, secondaryBtn } from './styles';

export function ChartState({
  status,
  onConnect,
  onRetry,
}: {
  status: TokenStatus;
  onConnect: () => void;
  onRetry?: () => void;
}) {
  if (status === 'ok') return null;
  return (
    <div style={{ ...pane, flexDirection: 'column', gap: 12, textAlign: 'center' }}>
      {status === 'no_token' ? (
        <>
          <span style={eyebrow}>ALGOPACK</span>
          <button type="button" style={primaryBtn} onClick={onConnect}>
            Подключить токен
          </button>
        </>
      ) : null}
      {status === 'connecting' ? (
        <>
          <div
            aria-hidden
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: '2px solid var(--color-border, #D5DBE5)',
              borderTopColor: 'var(--color-primary, #1A9B8E)',
              animation: 'futoi-spin 0.8s linear infinite',
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--color-muted-foreground, #5A6578)' }}>
            Идёт подключение
          </span>
        </>
      ) : null}
      {status === 'subscription_expired' ? (
        <>
          <span style={eyebrow}>Подписка</span>
          <p style={{ margin: 0, fontSize: 14 }}>Подписка ALGOPACK закончилась</p>
          <button type="button" style={primaryBtn} onClick={onConnect}>
            Сменить токен
          </button>
        </>
      ) : null}
      {status === 'upstream_error' ? (
        <>
          <span style={eyebrow}>Сбой</span>
          <p style={{ margin: 0, fontSize: 14 }}>Технический сбой. Данные сейчас недоступны</p>
          <button type="button" style={secondaryBtn} onClick={onRetry}>
            Повторить
          </button>
        </>
      ) : null}
    </div>
  );
}
