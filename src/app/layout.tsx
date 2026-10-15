import type { ReactNode } from 'react';
import { apiPath } from '@/lib/api-base';

export const metadata = {
  title: 'FUTOI',
  description: 'Открытые позиции ALGOPACK',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500&family=Manrope:wght@500;600&display=swap"
          rel="stylesheet"
        />
        {process.env.NEXT_PUBLIC_STATIC === '1' ? (
          <>
            <link rel="preload" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/data/series-Si.json`} as="fetch" crossOrigin="anonymous" />
            <link rel="preload" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/data/snapshot-Si.json`} as="fetch" crossOrigin="anonymous" />
          </>
        ) : (
          <link rel="preload" href={apiPath('/api/futoi/preview?secid=Si')} as="fetch" crossOrigin="anonymous" />
        )}
      </head>
      <body style={{ margin: 0, background: 'var(--color-background)', color: 'var(--color-foreground)', fontFamily: 'var(--font-family)' }}>
        <style>{`
          :root {
            --color-background: hsl(0 0% 100%);
            --color-foreground: hsl(222.2 84% 4.9%);
            --color-primary: hsl(221.2 83.2% 53.3%);
            --color-primary-foreground: hsl(210 40% 98%);
            --color-muted: hsl(210 40% 96.1%);
            --color-muted-foreground: hsl(215.4 16.3% 46.9%);
            --color-border: hsl(214.3 31.8% 91.4%);
            --color-accent: hsl(210 40% 96.1%);
            --color-accent-foreground: hsl(222.2 47.4% 11.2%);
            --color-card: hsl(0 0% 100%);
            --color-card-foreground: hsl(222.2 84% 4.9%);
            --color-destructive: hsl(0 72.2% 50.6%);
            --font-family: "IBM Plex Sans", system-ui, sans-serif;
            --radius: 0.5rem;
            --warn: color-mix(in srgb, var(--color-destructive) 45%, var(--color-primary));
          }
          html, body { background: var(--color-background); color: var(--color-foreground); }
          html[data-theme='dark'] { color-scheme: dark; }
          html[data-theme='light'] { color-scheme: light; }
          button { transition: transform 80ms ease, opacity 120ms ease; }
          button:active:not(:disabled) { transform: translateY(1px) scale(0.99); opacity: 0.78; }
          button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
          button[aria-busy='true'] { cursor: progress; opacity: 0.72; }
          @keyframes futoi-spin { to { transform: rotate(360deg); } }
          @keyframes futoi-load {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(350%); }
          }
        `}</style>
        {children}
      </body>
    </html>
  );
}
