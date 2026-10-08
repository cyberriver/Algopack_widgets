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
      <body style={{ margin: 0 }}>
        <style>{`
          :root {
            --color-background: #FFFFFF;
            --color-foreground: #0B1220;
            --color-primary: #1A9B8E;
            --color-muted-foreground: #5A6578;
            --color-border: #D5DBE5;
            --color-muted: #E8ECF1;
            --font-family: "IBM Plex Sans", system-ui, sans-serif;
            --radius: 10px;
          }
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
