import Link from 'next/link';
import { WIDGETS, extensionIdFor } from '@/lib/types';

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'var(--font-family, "IBM Plex Sans", system-ui)', padding: 24, maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontFamily: 'Manrope, sans-serif' }}>Algopack FUTOI</h1>
      <p style={{ color: 'var(--color-muted-foreground, #5A6578)' }}>
        Каталог виджетов. На доске каждая карточка — отдельный iframe с этого origin.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
        {WIDGETS.map((w) => (
          <li
            key={w.slug}
            style={{
              border: '1px solid var(--color-border, #D5DBE5)',
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            <Link href={`/widgets/${w.slug}`} style={{ color: 'var(--color-primary, #1A9B8E)' }}>
              {w.displayName}
            </Link>
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: '#8B95A8' }}>
              {extensionIdFor(w.slug)} · /widgets/{w.slug}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
