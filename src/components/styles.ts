import type { CSSProperties } from 'react';

export const page: CSSProperties = {
  fontFamily: 'var(--font-family, "IBM Plex Sans", system-ui, sans-serif)',
  color: 'var(--color-foreground, #0B1220)',
  background: 'var(--color-background, #FFFFFF)',
  padding: 16,
  boxSizing: 'border-box',
  width: '100%',
  height: '100%',
  overflow: 'auto',
};

export const title: CSSProperties = {
  fontFamily: 'Manrope, "IBM Plex Sans", sans-serif',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '-0.02em',
  margin: '0 0 6px',
};

export const hint: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-muted-foreground, #5A6578)',
  margin: '0 0 12px',
};

export const eyebrow: CSSProperties = {
  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--color-muted-foreground, #8B95A8)',
};

export const primaryBtn: CSSProperties = {
  background: 'var(--color-primary, #1A9B8E)',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: 10,
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};

export const secondaryBtn: CSSProperties = {
  background: 'var(--color-muted, #E8ECF1)',
  color: 'var(--color-foreground, #0B1220)',
  border: '1px solid var(--color-border, #D5DBE5)',
  borderRadius: 10,
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};

export const input: CSSProperties = {
  width: '100%',
  height: 42,
  borderRadius: 10,
  border: '1px solid var(--color-border, #D5DBE5)',
  padding: '0 12px',
  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
  fontSize: 13,
  boxSizing: 'border-box',
  outline: 'none',
};

export const pane: CSSProperties = {
  minHeight: 220,
  border: '1px solid var(--color-border, #D5DBE5)',
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  boxSizing: 'border-box',
  background: 'var(--color-background, #FFFFFF)',
};
