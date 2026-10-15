import type { CSSProperties } from 'react';

export const page: CSSProperties = {
  fontFamily: 'var(--font-family)',
  color: 'var(--color-foreground)',
  background: 'var(--color-background)',
  padding: 16,
  boxSizing: 'border-box',
  width: '100%',
  height: '100%',
  overflow: 'auto',
};

export const title: CSSProperties = {
  fontFamily: 'var(--font-family)',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '-0.02em',
  margin: '0 0 6px',
  color: 'var(--color-foreground)',
};

export const hint: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-muted-foreground)',
  margin: '0 0 12px',
};

export const eyebrow: CSSProperties = {
  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--color-muted-foreground)',
};

export const primaryBtn: CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-primary-foreground)',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};

export const secondaryBtn: CSSProperties = {
  background: 'var(--color-muted)',
  color: 'var(--color-foreground)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};

export const input: CSSProperties = {
  width: '100%',
  height: 42,
  borderRadius: 'var(--radius)',
  border: '1px solid var(--color-border)',
  padding: '0 12px',
  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
  fontSize: 13,
  boxSizing: 'border-box',
  outline: 'none',
  background: 'var(--color-card)',
  color: 'var(--color-card-foreground)',
};

export const pane: CSSProperties = {
  minHeight: 220,
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  boxSizing: 'border-box',
  background: 'var(--color-background)',
};
