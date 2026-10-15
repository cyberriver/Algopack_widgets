'use client';

import Link from 'next/link';
import { WIDGETS, type WidgetSlug } from '@/lib/types';
import { eyebrow } from './styles';

const FUTOI_ORDER: WidgetSlug[] = [
  'dashboard',
  'filter',
  'table',
  'oi-fiz',
  'oi-yur',
  'long-short-fiz',
  'long-short-yur',
  'directed-fiz',
  'directed-yur',
  'persons-fiz',
  'persons-yur',
];

const LAB_ORDER: WidgetSlug[] = [
  'lab-experiments',
  'lab-monitor',
  'lab-results',
];

function bySlug(slug: WidgetSlug) {
  return WIDGETS.find((w) => w.slug === slug);
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-block',
        padding: '4px 8px',
        borderRadius: 8,
        border: '1px solid var(--color-border)',
        background: active ? 'var(--color-muted)' : 'transparent',
        color: 'var(--color-foreground)',
        fontSize: 12,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Link>
  );
}

export function WidgetMenu({ current }: { current: WidgetSlug }) {
  return (
    <nav
      style={{
        marginBottom: 14,
        paddingBottom: 12,
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div style={{ ...eyebrow, marginBottom: 6 }}>Лаборатория</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {LAB_ORDER.map((slug) => {
          const w = bySlug(slug);
          if (!w) return null;
          return <Chip key={slug} href={`/widgets/${slug}`} label={w.displayName.replace(/^Лаборатория:\s*/, '')} active={current === slug} />;
        })}
      </div>
      <details open={current.startsWith('lab')}>
        <summary
          style={{
            ...eyebrow,
            cursor: 'pointer',
            listStyle: 'none',
            marginBottom: 6,
          }}
        >
          FUTOI виджеты
        </summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {FUTOI_ORDER.map((slug) => {
            const w = bySlug(slug);
            if (!w) return null;
            return (
              <Chip
                key={slug}
                href={`/widgets/${slug}`}
                label={w.displayName.replace(/^FUTOI\s*/, '')}
                active={current === slug}
              />
            );
          })}
        </div>
      </details>
    </nav>
  );
}
