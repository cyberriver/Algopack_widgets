'use client';

import { useState } from 'react';
import { input, primaryBtn, secondaryBtn, title } from './styles';

export function TokenModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (token: string) => void;
}) {
  const [value, setValue] = useState('');
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Подключить токен ALGOPACK"
      style={{
        position: 'fixed',
        inset: 0,
        background: '#00000073',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        padding: 16,
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const token = value.trim();
          if (!token) return;
          onSubmit(token);
          setValue('');
        }}
        style={{
          width: 'min(440px, 100%)',
          background: 'var(--color-background, #FFFFFF)',
          borderRadius: 14,
          padding: 24,
          boxShadow: '0 4px 24px rgba(11,18,32,0.06)',
        }}
      >
        <h2 style={title}>Токен ALGOPACK</h2>
        <p style={{ fontSize: 13, color: 'var(--color-muted-foreground, #5A6578)', margin: '0 0 16px' }}>
          На GitHub Pages токен остаётся в этом браузере (localStorage). В хост и топики не уходит. Если Мосбиржа
          режет CORS, график покажет запасной ряд.
        </p>
        <input
          autoFocus
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Bearer из data.moex.com"
          style={input}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Отмена
          </button>
          <button type="submit" style={primaryBtn}>
            Подключить
          </button>
        </div>
      </form>
    </div>
  );
}
