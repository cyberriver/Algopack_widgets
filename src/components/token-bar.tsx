'use client';

import { useState } from 'react';
import type { TokenStatus } from '@/lib/types';
import { eyebrow, input, primaryBtn, secondaryBtn } from './styles';

export function TokenBar({
  status,
  onConnect,
  onDisconnect,
}: {
  status: TokenStatus;
  onConnect: (token: string, remember: boolean) => void;
  onDisconnect: () => void;
}) {
  const [value, setValue] = useState('');
  const [remember, setRemember] = useState(true);
  const [edit, setEdit] = useState(false);
  const showForm = status !== 'ok' || edit;

  if (!showForm) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
          padding: '10px 12px',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          background: 'var(--color-muted)',
        }}
      >
        <span style={eyebrow}>ALGOPACK</span>
        <span style={{ fontSize: 13 }}>Подключено</span>
        <button type="button" onClick={() => setEdit(true)} style={{ ...secondaryBtn, padding: '6px 12px', marginLeft: 'auto' }}>
          Сменить токен
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const token = value.trim();
        if (!token) return;
        onConnect(token, remember);
        setValue('');
        setEdit(false);
      }}
      style={{
        display: 'grid',
        gap: 10,
        marginBottom: 16,
        padding: 16,
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        background: 'var(--color-card)',
      }}
    >
      <div>
        <span style={eyebrow}>ALGOPACK</span>
        <p style={{ margin: '6px 0 0', fontSize: 15, fontWeight: 600, fontFamily: 'Manrope, sans-serif' }}>
          Токен из личного кабинета
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--color-muted-foreground)' }}>
          Токен остаётся в браузере и уходит только на наш сервер, который вызывает APIM FUTOI. В хост FinamX не попадает. Как в{' '}
          <a href="https://minakovmax.github.io/finam-chart/" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>
            Finam Chart
          </a>
          .
        </p>
      </div>
      <input
        autoFocus={status === 'no_token'}
        type="password"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Bearer из data.moex.com / ALGOPACK"
        style={input}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        запомнить в этом браузере
      </label>
      {status === 'subscription_expired' ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-destructive)' }}>Подписка ALGOPACK закончилась или токен не принят</p>
      ) : null}
      {status === 'upstream_error' ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-destructive)' }}>MOEX не ответил. Проверьте токен и сеть, затем подключитесь снова</p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {status === 'ok' ? (
          <button
            type="button"
            onClick={() => {
              setEdit(false);
              onDisconnect();
            }}
            style={secondaryBtn}
          >
            Отключить
          </button>
        ) : null}
        <button type="submit" style={primaryBtn} disabled={!value.trim() || status === 'connecting'}>
          {status === 'connecting' ? 'Подключение…' : 'Подключиться'}
        </button>
      </div>
    </form>
  );
}
