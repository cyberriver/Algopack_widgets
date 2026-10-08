import type { ReactNode } from 'react';

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
        `}</style>
        {children}
      </body>
    </html>
  );
}
